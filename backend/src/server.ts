import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);

const app = await buildApp();

app.listen({ port }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
