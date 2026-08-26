import type { FastifyInstance } from 'fastify';
import { buildApp } from './src/app.js';

const app: FastifyInstance = buildApp();

export default app;
