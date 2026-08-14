import Fastify, { type FastifyInstance } from 'fastify';

import { registerAuthentication } from './plugins/authentication.js';
import {
  registerAuthContextRoute,
  SupabaseAuthContextRepository,
} from './modules/auth/auth-context.js';
import type { AuthContextRepository } from './modules/auth/auth-context.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { SupabaseProjectRepository } from './modules/projects/project-repository.js';
import { registerProjectRoutes } from './modules/projects/project-routes.js';
import type { AuthenticationService } from './plugins/authentication.js';
import type { ProjectRepository } from './modules/projects/project-repository.js';
import { SupabaseCompanyRepository } from './modules/companies/company-repository.js';
import type { CompanyRepository } from './modules/companies/company-repository.js';
import { registerCompanyRoutes } from './modules/companies/company-routes.js';
import { SupabaseContactRepository } from './modules/contacts/contact-repository.js';
import type { ContactRepository } from './modules/contacts/contact-repository.js';
import { registerContactRoutes } from './modules/contacts/contact-routes.js';
import { SupabaseEngineerRepository } from './modules/engineers/engineer-repository.js';
import type { EngineerRepository } from './modules/engineers/engineer-repository.js';
import { registerEngineerRoutes } from './modules/engineers/engineer-routes.js';
import { SupabaseProposalRepository } from './modules/proposals/proposal-repository.js';
import type { ProposalRepository } from './modules/proposals/proposal-repository.js';
import { registerProposalRoutes } from './modules/proposals/proposal-routes.js';
import { SupabaseInterviewRepository } from './modules/interviews/interview-repository.js';
import type { InterviewRepository } from './modules/interviews/interview-repository.js';
import { registerInterviewRoutes } from './modules/interviews/interview-routes.js';
import { SupabaseContractRepository } from './modules/contracts/contract-repository.js';
import type { ContractRepository } from './modules/contracts/contract-repository.js';
import { registerContractRoutes } from './modules/contracts/contract-routes.js';
import { SupabaseEngagementRepository } from './modules/engagements/engagement-repository.js';
import type { EngagementRepository } from './modules/engagements/engagement-repository.js';
import { registerEngagementRoutes } from './modules/engagements/engagement-routes.js';
import { SupabaseWorkLogRepository } from './modules/work-logs/work-log-repository.js';
import type { WorkLogRepository } from './modules/work-logs/work-log-repository.js';
import { registerWorkLogRoutes } from './modules/work-logs/work-log-routes.js';
import { SupabaseInvoiceRepository } from './modules/invoices/invoice-repository.js';
import type { InvoiceRepository } from './modules/invoices/invoice-repository.js';
import { registerInvoiceRoutes } from './modules/invoices/invoice-routes.js';
import { SupabaseAccountingPeriodRepository } from './modules/accounting-periods/accounting-period-repository.js';
import type { AccountingPeriodRepository } from './modules/accounting-periods/accounting-period-repository.js';
import { registerAccountingPeriodRoutes } from './modules/accounting-periods/accounting-period-routes.js';
import { SupabaseAccountingExportRepository } from './modules/accounting-exports/accounting-export-repository.js';
import type { AccountingExportRepository } from './modules/accounting-exports/accounting-export-repository.js';
import { registerAccountingExportRoutes } from './modules/accounting-exports/accounting-export-routes.js';
import { SupabaseExpenseRepository } from './modules/expenses/expense-repository.js';
import type { ExpenseRepository } from './modules/expenses/expense-repository.js';
import { registerExpenseRoutes } from './modules/expenses/expense-routes.js';

export interface AppDependencies {
  authentication?: AuthenticationService;
  projects?: ProjectRepository;
  authContext?: AuthContextRepository;
  companies?: CompanyRepository;
  contacts?: ContactRepository;
  engineers?: EngineerRepository;
  proposals?: ProposalRepository;
  interviews?: InterviewRepository;
  contracts?: ContractRepository;
  engagements?: EngagementRepository;
  workLogs?: WorkLogRepository;
  invoices?: InvoiceRepository;
  accountingPeriods?: AccountingPeriodRepository;
  accountingExports?: AccountingExportRepository;
  expenses?: ExpenseRepository;
}

export function buildApp(dependencies: AppDependencies = {}): FastifyInstance {
  const app = Fastify({
    genReqId: (request) => {
      const requestId = request.headers['x-request-id'];
      return typeof requestId === 'string' && requestId.length > 0
        ? requestId
        : crypto.randomUUID();
    },
  });

  registerErrorHandler(app);
  registerAuthentication(app, dependencies.authentication);

  app.addHook('onSend', (request, reply, payload, done) => {
    void reply.header('x-request-id', request.id);
    done(null, payload);
  });

  app.get('/health', () => ({ status: 'ok' as const }));

  registerAuthContextRoute(
    app,
    dependencies.authContext ?? new SupabaseAuthContextRepository(),
  );

  registerProjectRoutes(
    app,
    dependencies.projects ?? new SupabaseProjectRepository(),
  );
  registerCompanyRoutes(
    app,
    dependencies.companies ?? new SupabaseCompanyRepository(),
  );
  registerContactRoutes(
    app,
    dependencies.contacts ?? new SupabaseContactRepository(),
  );
  registerEngineerRoutes(
    app,
    dependencies.engineers ?? new SupabaseEngineerRepository(),
  );
  registerProposalRoutes(
    app,
    dependencies.proposals ?? new SupabaseProposalRepository(),
  );
  registerInterviewRoutes(
    app,
    dependencies.interviews ?? new SupabaseInterviewRepository(),
  );
  registerContractRoutes(
    app,
    dependencies.contracts ?? new SupabaseContractRepository(),
  );
  registerEngagementRoutes(
    app,
    dependencies.engagements ?? new SupabaseEngagementRepository(),
  );
  registerWorkLogRoutes(
    app,
    dependencies.workLogs ?? new SupabaseWorkLogRepository(),
  );
  registerInvoiceRoutes(
    app,
    dependencies.invoices ?? new SupabaseInvoiceRepository(),
  );
  registerAccountingPeriodRoutes(
    app,
    dependencies.accountingPeriods ?? new SupabaseAccountingPeriodRepository(),
  );
  registerAccountingExportRoutes(
    app,
    dependencies.accountingExports ?? new SupabaseAccountingExportRepository(),
  );
  registerExpenseRoutes(
    app,
    dependencies.expenses ?? new SupabaseExpenseRepository(),
  );

  return app;
}
