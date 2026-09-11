"use client";

import { useState } from "react";
import { toast } from "sonner";
import { parsePrice } from "@catapreco/core";
import { Button, Input, Modal } from "@/components/ui";

/** Remove flow: bought (records savings) or dismissed. */
export function RemoveModal({
  productId,
  title,
  onClose,
  onRemoved,
}: {
  productId: string;
  title: string;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [step, setStep] = useState<"ask" | "paid">("ask");
  const [paid, setPaid] = useState("");
  const [saving, setSaving] = useState(false);

  async function remove(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "falha ao remover");
      return data;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Remover produto" onClose={onClose}>
      <p className="mb-3 text-sm">
        Você comprou <strong>{title}</strong>?
      </p>
      {step === "ask" && (
        <div className="flex gap-2">
          <Button
            disabled={saving}
            onClick={async () => {
              await remove({ resolution: "dismissed" });
              toast("Produto removido");
              onRemoved();
              onClose();
            }}
            variant="ghost"
          >
            Desisti da compra
          </Button>
          <Button disabled={saving} onClick={() => setStep("paid")}>
            Sim, comprei
          </Button>
        </div>
      )}
      {step === "paid" && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const paidCents = parsePrice(paid);
            if (!paidCents) return toast.error("valor inválido");
            const data = await remove({ resolution: "bought", paidCents });
            const saved = data.purchase?.savedCents ?? 0;
            toast.success(
              saved > 0
                ? `Compra registrada — você economizou R$ ${(saved / 100).toFixed(2).replace(".", ",")}`
                : "Compra registrada",
            );
            onRemoved();
            onClose();
          }}
        >
          <Input
            autoFocus
            placeholder="Quanto pagou? (ex: 2799,90)"
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
            inputMode="decimal"
          />
          <Button type="submit" disabled={saving || !paid}>Confirmar</Button>
        </form>
      )}
    </Modal>
  );
}
