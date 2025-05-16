# Dissertation Project

## Local Cloud Storage Solution built with SvelteKit/Docker/Postgres

This project is a local cloud storage solution designed to allow users to upload, organize, and manage their files and folders through a web interface. It provides basic file management capabilities similar to cloud storage services, but intended for local deployment to reduce dependency on cloud services

### Functionality

- **File and Folder Management:** Upload files, preview files, download files, create folders, navigate through directories, delete files and folders.
- **File Organization:** Store files within folders.
- **Filtering/Searching:** Filter and search for files and folders utilising search and filtering by type and date range.

### Technologies Used

- **SvelteKit:** Used as the full-stack framework for building the user interface and handling server-side logic.
- **Docker:** Provides containerization for the application, database, database admin interface and NGINX reverse proxy - ensuring consistent environments and easy deployment.
- **PostgreSQL:** Serves as the relational database for storing metadata about files, folders, and users.

### Getting Started

To run this project locally using Docker, you need to have Docker and Docker Compose installed on your system.

1.  Clone the repository.
2.  Navigate to the root directory of the project in your terminal.
3.  Create a `.env` file in the root directory with the following properties filled in:

```
POSTGRES_PASSWORD=
DATABASE_URL=
PGADMIN_DEFAULT_EMAIL=
PGADMIN_DEFAULT_PASSWORD=
```

4. Check the NGINX configuration if you wish to use your Tailnet URL as a destination. Please use your own URL and then obtain your own Tailscale certificates.
5. Run the following command to build the Docker images and start the containers:

```bash
docker compose up --build
```

Port 5050 can be forwarded to then provide a PGAdmin instance for manually editing the database, if necessary. The credentials to login are set in the aforementioned `.env` file.
