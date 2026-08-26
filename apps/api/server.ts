import 'fastify';
import { buildApp } from './src/app.js';

const app = buildApp();
void app.listen({ port: Number(process.env.PORT ?? 3000) });
