/**
 * Provider capability tracker.
 *
 * Tracks runtime readiness for each registered provider so that
 * `/v1/models` advertises only genuinely usable models while still
 * exposing full diagnostic state for operators.
 *
 * A provider is not ready merely because its adapter compiles.
 * Advertising it requires evidence of live usability. This module
 * enforces that boundary.
 *
 * States (from least to most capable):
 *  - installed:     adapter code exists, never verified at runtime
 *  - authenticated: login succeeded but reachability not confirmed
 *  - reachable:     network-level contact confirmed
 *  - ready:         full end-to-end capability verified with evidence
 *  - degraded:      partially working (quota nearing limit, intermittent)
 *  - disabled:      administratively turned off by the operator
 */

export type ProviderCapabilityStatus =
  | 'installed'
  | 'authenticated'
  | 'reachable'
  | 'ready'
  | 'degraded'
  | 'disabled';

export interface CapabilityEvidence {
  /** Opaque reference to evidence (test ID, commit, probe result, etc.). */
  reference: string;
  /** ISO-8601 timestamp when evidence was recorded. */
  recordedAt: string;
  /** ISO-8601 timestamp when evidence expires, if applicable. */
  expiresAt?: string;
}

export interface ProviderCapabilityRecord {
  providerId: string;
  status: ProviderCapabilityStatus;
  evidence: CapabilityEvidence | null;
  /** Human-readable note about the current state. */
  detail: string | null;
  /** ISO-8601 timestamp of last status change. */
  updatedAt: string;
}

/** Statuses that qualify a provider as usable for `/v1/models`. */
const READY_STATUSES: ReadonlySet<ProviderCapabilityStatus> = new Set([
  'ready',
  'degraded',
]);

/**
 * Singleton capability tracker.
 *
 * Holds the current state of each known provider. The registry populates
 * entries when providers are registered; login and probe CLIs update
 * them when evidence is gathered.
 */
class CapabilityTracker {
  private readonly records = new Map<string, ProviderCapabilityRecord>();

  /** Register a provider with its initial capability status. */
  register(
    providerId: string,
    initialStatus: ProviderCapabilityStatus = 'installed',
    detail: string | null = null,
  ): void {
    this.records.set(providerId, {
      providerId,
      status: initialStatus,
      evidence: null,
      detail,
      updatedAt: new Date().toISOString(),
    });
  }

  /** Update a provider's capability status with optional evidence. */
  setStatus(
    providerId: string,
    status: ProviderCapabilityStatus,
    evidence?: CapabilityEvidence,
    detail?: string,
  ): void {
    const existing = this.records.get(providerId);
    if (!existing) {
      // Auto-register unknown providers so callers don't need to pre-register.
      this.records.set(providerId, {
        providerId,
        status,
        evidence: evidence ?? null,
        detail: detail ?? null,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    existing.status = status;
    if (evidence !== undefined) existing.evidence = evidence;
    if (detail !== undefined) existing.detail = detail;
    existing.updatedAt = new Date().toISOString();
  }

  /** Check whether a provider is currently usable. */
  isReady(providerId: string): boolean {
    const record = this.records.get(providerId);
    if (!record) return false;
    return READY_STATUSES.has(record.status);
  }

  /** Check whether evidence has expired for a provider. */
  isEvidenceExpired(providerId: string): boolean {
    const record = this.records.get(providerId);
    if (!record || !record.evidence?.expiresAt) return false;
    return new Date(record.evidence.expiresAt) <= new Date();
  }

  /** Get the capability record for a specific provider. */
  getStatus(providerId: string): ProviderCapabilityRecord | undefined {
    return this.records.get(providerId);
  }

  /** Get all capability records (for diagnostic display). */
  getAllStatuses(): ProviderCapabilityRecord[] {
    return [...this.records.values()];
  }

  /** Get the IDs of all providers that are currently ready. */
  getReadyProviderIds(): string[] {
    const result: string[] = [];
    for (const record of this.records.values()) {
      if (READY_STATUSES.has(record.status)) {
        result.push(record.providerId);
      }
    }
    return result;
  }

  /** Reset all state (for testing). */
  reset(): void {
    this.records.clear();
  }
}

/** Module-level singleton shared across the relay process. */
export const capabilityTracker = new CapabilityTracker();
