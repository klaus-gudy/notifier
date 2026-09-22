# Production container

Build from this project directory:

```sh
docker build -t notifier:local .
docker run --rm --name notifier -p 3000:3000 --env-file /path/to/runtime.env notifier:local
```

The image builds with Node 24.18.0 and runs compiled JavaScript as the non-root
`node` user. Only production dependencies, compiled code (including migrations),
and package metadata enter the runtime image. Local `.env*` files are excluded;
supply secrets and connection settings at runtime. `PORT` defaults to 3000.
Choose a different host port, such as `-p 3001:3000`, when running both services.

Set `DATABASE_URL` (or the discrete `DATABASE_*` settings) and `RABBITMQ_URL`
to addresses reachable from the container. On a shared Docker network, use
service names and container ports; on Docker Desktop, `host.docker.internal`
reaches services published on the host. `localhost` refers to this container.

The default command is `node dist/main.js`. Keep it as the deployment start
command; development commands need tooling deliberately omitted from this image.

## Database and queues

This service already applies its TypeORM migrations on startup; the compiled
migrations are included in the image. Point it at its own notification database.

Configure `RABBITMQ_EMAIL_QUEUE=NOTIFIER_EMAIL_QUEUE` and
`RABBITMQ_SMS_QUEUE=NOTIFIER_SMS_QUEUE` to match the producers. Those queues must
already exist: consumers check them rather than declare them. Configure the
Resend and Notify Africa credentials for the delivery channels you use.

For an isolated startup check, use `RABBITMQ_ENABLED=false` and
`NOTIFY_POLL_ENABLED=false`. These disable consumption and delivery polling;
normal production operation requires the broker and provider configuration.
