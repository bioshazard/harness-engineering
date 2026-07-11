import { FileRunStore } from "../../../../lib/store.js";
import { PocockWorkflow, type PocockRun, type Receipt } from "./workflow.js";

/** The authority seam shared by Pi's /crust command and deterministic exercises. */
export class PocockOperator {
  constructor(private readonly workflow: PocockWorkflow, private readonly store: FileRunStore<PocockRun>, private readonly id = "operator") {}
  async approve(proposalId: string, reason?: string) { const proposal = this.workflow.approve(proposalId, this.id, reason); await this.store.save(this.workflow.state); return proposal; }
  async reject(proposalId: string, reason?: string) { const proposal = this.workflow.reject(proposalId, this.id, reason); await this.store.save(this.workflow.state); return proposal; }
  async advance(): Promise<Receipt> { const receipt = this.workflow.advance(this.id); await this.store.save(this.workflow.state); return receipt; }
}
