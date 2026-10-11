<img width="1365" height="685" alt="image" src="https://github.com/user-attachments/assets/c22dda39-478d-4ebc-9438-26e303bfdacd" /># Lebron-site

A personal web project featuring user authentication with magic links and a self-hosted deployment setup.

**Live Website:** [https://lebronjames.io.vn/](https://lebronjames.io.vn/)

## Overview

Lebron-site is a web application project focused on implementing passwordless authentication and learning practical web deployment workflows.
<img width="1365" height="685" alt="image" src="https://github.com/user-attachments/assets/bfd722f2-679c-43af-8bb6-6748d338fee7" />

## Features

- **Magic Link Authentication:** Passwordless login using email verification links.
- **Backend API:** Server-side functionality built with Node.js and Express.js.
- **Database Integration:** MySQL for storing application data.
- **Containerization:** Docker and Docker Compose for application deployment.
- **HTTPS:** Secure website access through domain and reverse-proxy configuration.
- **Deployment Automation:** Shell scripts and deployment documentation to simplify server setup.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **Deployment:** Docker, Docker Compose, Nginx
- **Domain & DNS:** Custom domain with Cloudflare
- **Infrastructure:** Self-hosted Linux VPS
- **Version Control:** Git and GitHub

## Deployment

The application is deployed on a Linux VPS using Docker and Nginx, with a custom domain and HTTPS configuration.

For setup instructions, see [`DEPLOY.md`](DEPLOY.md).

## Project Structure

```text
Lebron-site/
├── db/
│   └── init.sql
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── deploy.sh
├── DEPLOY.md
├── index.html
├── script.js
├── server.js
├── style.css
└── package.json
```

## Security

- Environment variables are used for sensitive configuration.
- Actual credentials and secrets should not be committed to version control.
- HTTPS is configured for secure communication.

## Author

**Viet Tuong**

GitHub: [@tuongtaylorswitch](https://github.com/tuongtaylorswitch)
