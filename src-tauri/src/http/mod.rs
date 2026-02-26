pub mod client {
    use reqwest::Client;

    pub struct HttpClient {
        client: Client,
    }

    impl HttpClient {
        pub fn new() -> Result<Self, reqwest::Error> {
            let client = Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .tcp_nodelay(true)
                .tcp_keepalive(std::time::Duration::from_secs(60))
                .build()?;

            Ok(Self { client })
        }

        pub fn client(&self) -> &Client {
            &self.client
        }
    }

    pub struct ClientPool {
        clients: Vec<Client>,
    }

    impl ClientPool {
        pub fn new(size: usize) -> Result<Self, reqwest::Error> {
            let mut clients = Vec::with_capacity(size);
            for _ in 0..size {
                clients.push(
                    Client::builder()
                        .timeout(std::time::Duration::from_secs(300))
                        .tcp_nodelay(true)
                        .tcp_keepalive(std::time::Duration::from_secs(60))
                        .build()?,
                );
            }
            Ok(Self { clients })
        }

        pub fn get(&self, index: usize) -> &Client {
            &self.clients[index % self.clients.len()]
        }

        pub fn len(&self) -> usize {
            self.clients.len()
        }
    }
}
