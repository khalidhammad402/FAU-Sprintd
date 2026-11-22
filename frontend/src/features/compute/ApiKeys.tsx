import { useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useApiKeys, useCustomerMutations } from "@/api/queries";
import type { ApiKey } from "@/api/types";
import { Button, Card, CardHeader, ConfirmDialog, DataTable, EmptyState, QueryState, Skeleton, type Column } from "@/design-system";

/** The backend's key id is the secret itself (docs/gaps/compute.md): only show a short prefix after creation. */
const mask = (k: ApiKey) => `${(k.prefix ?? k.id).slice(0, 7)}…`;
const created = (k: ApiKey) => (k.createdAt ? new Date(k.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "–");

export default function ApiKeys() {
  const keys = useApiKeys();
  const { createKey, deleteKey } = useCustomerMutations();
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoke, setRevoke] = useState<ApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setError(null);
    try {
      const k = await createKey.mutateAsync();
      setFresh((k.key as string | undefined) ?? k.id);
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The key could not be created.");
    }
  };
  const cols: Column<ApiKey>[] = [
    { key: "id", label: "Key", render: (k) => <span className="font-mono text-xs">{mask(k)}</span> },
    { key: "createdAt", label: "Created", render: (k) => <span className="tnum">{created(k)}</span> },
    {
      key: "x",
      label: "",
      sortable: false,
      render: (k) => (
        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRevoke(k)} aria-label={`Revoke key ${mask(k)}`}>
          Revoke
        </Button>
      ),
    },
  ];
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card className="flex flex-col gap-4 p-5">
        <CardHeader
          title="API keys"
          sub="Submit and follow jobs from your own systems with POST /api/v1/customer/jobs."
          right={
            <Button variant="primary" icon={Plus} onClick={create} disabled={createKey.isPending}>
              {createKey.isPending ? "Creating…" : "Create key"}
            </Button>
          }
        />
        {fresh && (
          <div role="status" className="rounded-card border border-ok/40 bg-ok/10 p-4">
            <p className="text-sm font-semibold">Copy your new key now. It is shown only once.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-ctl border border-line bg-surface px-3 py-2 font-mono text-xs">{fresh}</code>
              <Button
                icon={copied ? Check : Copy}
                onClick={async () => {
                  await navigator.clipboard?.writeText(fresh).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="ghost" onClick={() => setFresh(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-critical-ink">
            {error}
          </p>
        )}
      </Card>
      <QueryState
        query={keys}
        skeleton={<Skeleton className="h-32 w-full" />}
        empty={
          <Card>
            <EmptyState icon={KeyRound} title="No API keys yet" body="Create a key to submit jobs from scripts or pipelines." action={<Button variant="primary" icon={Plus} onClick={create}>Create key</Button>} />
          </Card>
        }
      >
        {(list) => <DataTable caption="API keys" columns={cols} rows={list} rowKey={(k) => k.id} maxHeight="400px" />}
      </QueryState>
      <ConfirmDialog
        open={!!revoke}
        onOpenChange={(o) => !o && setRevoke(null)}
        title={`Revoke key ${revoke ? mask(revoke) : ""}?`}
        body="Systems that use this key stop working at once. This cannot be undone."
        confirmLabel="Revoke key"
        danger
        busy={deleteKey.isPending}
        onConfirm={async () => {
          if (!revoke) return;
          try {
            await deleteKey.mutateAsync(revoke.id);
          } catch (e) {
            setError(e instanceof Error ? e.message : "The key could not be revoked.");
          }
          setRevoke(null);
        }}
      />
    </div>
  );
}
