import { buildApp } from './app';

const port = Number(process.env.PORT ?? 3000);

const app = await buildApp();

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
