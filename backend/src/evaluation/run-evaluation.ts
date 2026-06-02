import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { EvaluationService } from './evaluation.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const evaluationService = app.get(EvaluationService);
  const summary = await evaluationService.runEvaluation();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
