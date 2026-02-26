pub struct Scheduler {
    max_concurrent: usize,
    queue: Vec<String>,
}

impl Scheduler {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            max_concurrent,
            queue: Vec::new(),
        }
    }

    pub fn add_to_queue(&mut self, id: String) {
        if !self.queue.contains(&id) {
            self.queue.push(id);
        }
    }

    pub fn remove_from_queue(&mut self, id: &str) {
        self.queue.retain(|i| i != id);
    }

    pub fn get_queue(&self) -> &[String] {
        &self.queue
    }

    pub fn can_start_more(&self, active_count: usize) -> bool {
        active_count < self.max_concurrent
    }

    pub fn set_max_concurrent(&mut self, max: usize) {
        self.max_concurrent = max;
    }
}
