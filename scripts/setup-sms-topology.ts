/**
 * Declares the SMS queue topology, mirroring the email one Jarvis already
 * publishes into:
 *
 *   jarvis.sms (topic) --#--> NOTIFIER_SMS_QUEUE --x-dead-letter-->
 *   jarvis.sms.dlx (direct) --NOTIFIER_SMS_QUEUE--> NOTIFIER_SMS_QUEUE_DEAD
 *
 * The notifier itself only calls checkQueue — it consumes, it does not declare.
 * Something has to create the topology first, and asserting a queue is not
 * enough on its own: an unbound queue never receives a message, which fails
 * silently. This binds it too.
 *
 * Every call is an assert, so re-running is a no-op. It is deliberately
 * separate from app startup: run it once per environment, like a migration.
 *
 *   npm run queue:setup
 */
import * as dotenv from 'dotenv';
import * as amqp from 'amqplib';

dotenv.config();

const URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5682';
const QUEUE = process.env.RABBITMQ_SMS_QUEUE ?? 'NOTIFIER_SMS_QUEUE';
// The exchange Jarvis publishes SMS events to, named like jarvis.emails.
const EXCHANGE = process.env.RABBITMQ_SMS_EXCHANGE ?? 'jarvis.sms';
const DLX = `${EXCHANGE}.dlx`;
const DEAD_QUEUE = `${QUEUE}_DEAD`;

/** Matches NOTIFIER_EMAIL_QUEUE: classic, durable, dead-lettered by name. */
const QUEUE_ARGS = {
  'x-dead-letter-exchange': DLX,
  'x-dead-letter-routing-key': QUEUE,
  'x-queue-type': 'classic',
};

async function main(): Promise<void> {
  const connection = await amqp.connect(URL);
  const channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  await channel.assertExchange(DLX, 'direct', { durable: true });
  console.log(`exchange   ${EXCHANGE} (topic)`);
  console.log(`exchange   ${DLX} (direct)`);

  // The dead-letter queue first, so a message rejected the instant the main
  // queue appears still has somewhere to land.
  await channel.assertQueue(DEAD_QUEUE, {
    durable: true,
    arguments: { 'x-queue-type': 'classic' },
  });
  await channel.bindQueue(DEAD_QUEUE, DLX, QUEUE);
  console.log(`queue      ${DEAD_QUEUE} <- ${DLX} (key "${QUEUE}")`);

  await channel.assertQueue(QUEUE, { durable: true, arguments: QUEUE_ARGS });
  await channel.bindQueue(QUEUE, EXCHANGE, '#');
  console.log(`queue      ${QUEUE} <- ${EXCHANGE} (key "#")`);

  const { messageCount, consumerCount } = await channel.checkQueue(QUEUE);
  console.log(
    `\nready: ${QUEUE} messages=${messageCount} consumers=${consumerCount}`,
  );

  await channel.close();
  await connection.close();
}

main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);

  // A PRECONDITION_FAILED here means the queue already exists with different
  // arguments — inspect it rather than deleting it, it may hold messages.
  console.error(`\nFailed to declare the SMS topology: ${reason}`);
  process.exit(1);
});
