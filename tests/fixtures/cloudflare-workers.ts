export abstract class WorkerEntrypoint<Env> {
	protected ctx: ExecutionContext;
	protected env: Env;

	constructor(ctx: ExecutionContext, env: Env) {
		this.ctx = ctx;
		this.env = env;
	}
}
