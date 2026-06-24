import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useAuthStore } from "@/auth/store";
import { useDriverPayout, usePatchDriverPayout } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";

function Field({ label, value, onChangeText, placeholder, secure }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; secure?: boolean;
}) {
  return (
    <View className="mb-3">
      <Text className="text-xs uppercase tracking-wide text-muted mb-1">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secure}
        placeholderTextColor="#9ca3af"
        className="rounded-md border border-border bg-surface px-4 py-3 text-white"
      />
    </View>
  );
}

export default function PayoutScreen() {
  const driverId = useAuthStore((s) => s.driverId);
  const { data: payout } = useDriverPayout(driverId);
  const patchPayout = usePatchDriverPayout(driverId ?? 0);

  const [legalName, setLegalName] = useState("");
  const [email, setEmail] = useState("");
  const [bankName, setBankName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (payout) {
      setLegalName(payout.payoutLegalName ?? "");
      setEmail(payout.payoutEmail ?? "");
      setBankName(payout.payoutBankName ?? "");
    }
  }, [payout]);

  async function handleSave() {
    setSaved(false);
    await patchPayout.mutateAsync({
      payoutLegalName: legalName || undefined,
      payoutEmail: email || undefined,
      payoutBankName: bankName || undefined,
      payoutRoutingNumber: routingNumber || undefined,
      payoutAccountNumber: accountNumber || undefined,
    });
    setRoutingNumber("");
    setAccountNumber("");
    setSaved(true);
  }

  return (
    <ScreenContainer>
      <View className="pt-4">
        <Card className="mb-5">
          <Text className="text-[11px] uppercase text-muted mb-2">On File</Text>
          <Text className="text-white text-sm mb-1">Routing: {payout?.hasRoutingNumber ? `•••• ${payout.routingLast4}` : "Not set"}</Text>
          <Text className="text-white text-sm">Account: {payout?.hasAccountNumber ? `•••• ${payout.accountLast4}` : "Not set"}</Text>
        </Card>

        <Field label="Legal Name" value={legalName} onChangeText={setLegalName} />
        <Field label="Payout Email" value={email} onChangeText={setEmail} />
        <Field label="Bank Name" value={bankName} onChangeText={setBankName} />
        <Field label="Routing Number" value={routingNumber} onChangeText={setRoutingNumber} placeholder="Enter to update" secure />
        <Field label="Account Number" value={accountNumber} onChangeText={setAccountNumber} placeholder="Enter to update" secure />

        {saved ? <Text className="text-success text-sm mb-3 text-center">Saved.</Text> : null}

        <GoldButton label="Save" onPress={handleSave} loading={patchPayout.isPending} />
      </View>
    </ScreenContainer>
  );
}
