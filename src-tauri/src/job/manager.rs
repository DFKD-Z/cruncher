use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::job::types::{ImageJobRequest, ImageJobState, JobFileState, JobStatus};

#[derive(Clone)]
pub struct JobManager {
    inner: Arc<Mutex<Inner>>,
}

struct Inner {
    next_id: u64,
    jobs: HashMap<String, ManagedJob>,
}

struct ManagedJob {
    request: ImageJobRequest,
    state: ImageJobState,
    cancel_flag: Arc<AtomicBool>,
}

impl Default for JobManager {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                next_id: 1,
                jobs: HashMap::new(),
            })),
        }
    }
}

impl JobManager {
    pub fn create_job(&self, request: ImageJobRequest) -> Result<String, String> {
        let mut guard = self.inner.lock().map_err(|_| "Job manager poisoned")?;
        let job_id = format!("img-job-{}", guard.next_id);
        guard.next_id += 1;
        let now = now_ms();

        let files = request
            .inputs
            .iter()
            .map(|input| JobFileState {
                input_path: input.clone(),
                output_path: None,
                status: JobStatus::Pending,
                progress: 0.0,
                error: None,
            })
            .collect::<Vec<_>>();

        let state = ImageJobState {
            job_id: job_id.clone(),
            status: JobStatus::Pending,
            created_at_ms: now,
            started_at_ms: None,
            completed_at_ms: None,
            total_files: request.inputs.len(),
            completed_files: 0,
            failed_files: 0,
            cancelled_files: 0,
            overall_progress: 0.0,
            files,
        };

        guard.jobs.insert(
            job_id.clone(),
            ManagedJob {
                request,
                state,
                cancel_flag: Arc::new(AtomicBool::new(false)),
            },
        );
        Ok(job_id)
    }

    pub fn get_request(&self, job_id: &str) -> Result<ImageJobRequest, String> {
        let guard = self.inner.lock().map_err(|_| "Job manager poisoned")?;
        guard
            .jobs
            .get(job_id)
            .map(|j| j.request.clone())
            .ok_or_else(|| format!("Job not found: {job_id}"))
    }

    pub fn list_jobs(&self) -> Result<Vec<ImageJobState>, String> {
        let guard = self.inner.lock().map_err(|_| "Job manager poisoned")?;
        let mut jobs = guard
            .jobs
            .values()
            .map(|job| job.state.clone())
            .collect::<Vec<_>>();
        jobs.sort_by_key(|j| j.created_at_ms);
        Ok(jobs)
    }

    pub fn get_job(&self, job_id: &str) -> Result<ImageJobState, String> {
        let guard = self.inner.lock().map_err(|_| "Job manager poisoned")?;
        guard
            .jobs
            .get(job_id)
            .map(|job| job.state.clone())
            .ok_or_else(|| format!("Job not found: {job_id}"))
    }

    pub fn mark_running(&self, job_id: &str) -> Result<(), String> {
        self.with_job(job_id, |job| {
            job.state.status = JobStatus::Running;
            job.state.started_at_ms = Some(now_ms());
        })
    }

    pub fn update_file(
        &self,
        job_id: &str,
        file_index: usize,
        status: Option<JobStatus>,
        progress: Option<f32>,
        output_path: Option<String>,
        error: Option<String>,
    ) -> Result<(), String> {
        self.with_job(job_id, |job| {
            if let Some(file) = job.state.files.get_mut(file_index) {
                if let Some(s) = status {
                    file.status = s;
                }
                if let Some(p) = progress {
                    file.progress = p.clamp(0.0, 100.0);
                }
                if let Some(path) = output_path.as_ref() {
                    file.output_path = Some(path.clone());
                }
                if let Some(err) = error.as_ref() {
                    file.error = Some(err.clone());
                }
            }
            recalc_state(&mut job.state);
        })
    }

    pub fn finish_job(&self, job_id: &str, status: JobStatus) -> Result<(), String> {
        self.with_job(job_id, |job| {
            job.state.status = status;
            job.state.completed_at_ms = Some(now_ms());
            if matches!(status, JobStatus::Completed) {
                job.state.overall_progress = 100.0;
            }
        })
    }

    pub fn cancel_job(&self, job_id: &str) -> Result<(), String> {
        self.with_job(job_id, |job| {
            job.cancel_flag.store(true, Ordering::Release);
            if matches!(job.state.status, JobStatus::Pending | JobStatus::Running) {
                job.state.status = JobStatus::Cancelled;
            }
        })
    }

    pub fn cancel_flag(&self, job_id: &str) -> Result<Arc<AtomicBool>, String> {
        let guard = self.inner.lock().map_err(|_| "Job manager poisoned")?;
        let job = guard
            .jobs
            .get(job_id)
            .ok_or_else(|| format!("Job not found: {job_id}"))?;
        Ok(job.cancel_flag.clone())
    }

    fn with_job<F>(&self, job_id: &str, mut f: F) -> Result<(), String>
    where
        F: FnMut(&mut ManagedJob),
    {
        let mut guard = self.inner.lock().map_err(|_| "Job manager poisoned")?;
        let job = guard
            .jobs
            .get_mut(job_id)
            .ok_or_else(|| format!("Job not found: {job_id}"))?;
        f(job);
        Ok(())
    }
}

fn recalc_state(state: &mut ImageJobState) {
    let mut completed = 0usize;
    let mut failed = 0usize;
    let mut cancelled = 0usize;
    let mut sum_progress = 0.0f32;

    for file in &state.files {
        sum_progress += file.progress;
        match file.status {
            JobStatus::Completed => completed += 1,
            JobStatus::Failed => failed += 1,
            JobStatus::Cancelled => cancelled += 1,
            JobStatus::Pending | JobStatus::Running => {}
        }
    }

    state.completed_files = completed;
    state.failed_files = failed;
    state.cancelled_files = cancelled;
    state.overall_progress = if state.total_files == 0 {
        100.0
    } else {
        (sum_progress / state.total_files as f32).clamp(0.0, 100.0)
    };
}

fn now_ms() -> u64 {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_millis() as u64,
        Err(_) => 0,
    }
}

