import { useEffect, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import { useAuthStore } from "@/auth/store";
import { useDriverPayout, usePatchDriverPayout } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";
import { EmptyState } from "@/components/DriverUI";
import { digitsOnly, validatePayoutSecrets } from "@/domain/payout";

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
  const { data: payout, isLoading, isError, refetch } = useDriverPayout(driverId);
  const patchPayout = usePatchDriverPayout(driverId ?? 0);

  const [legalName, setLegalName] = useState("");
  const [email, setEmail] = useState("");
  const [bankName, setBankName] = useState("");
  const [ssn, setSsn] = useState("");
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
    const validationError = validatePayoutSecrets({ ssn, routingNumber, accountNumber });
    if (validationError) {
      Alert.alert("Check your payout details", validationError);
      return;
    }
    try {
      await patchPayout.mutateAsync({
        payoutLegalName: legalName || undefined,
        payoutEmail: email || undefined,
        payoutBankName: bankName || undefined,
        payoutSsn: digitsOnly(ssn, 9) || undefined,
        payoutRoutingNumber: digitsOnly(routingNumber, 9) || undefined,
        payoutAccountNumber: digitsOnly(accountNumber, 20) || undefined,
      });
      setRoutingNumber("");
      setAccountNumber("");
      setSsn("");
      setSaved(true);
    } catch {
      Alert.alert("Couldn't save", "Please check your connection and try again.");
    }
  }

  if (isLoading) {
    return <ScreenContainer><EmptyState loading title="Loading payout details" message="Retrieving your masked banking information." /></ScreenContainer>;
  }
  if (isError || !payout) {
    return <ScreenContainer><EmptyState title="Couldn't load payout details" message="Your banking details were not changed. Check your connection and try again." onRetry={() => void refetch()} /></ScreenContainer>;
  }

  return (
    <ScreenContainer>
      <View className="pt-4">
        <Card className="mb-5">
          <Text className="text-[11px] uppercase text-muted mb-2">On File</Text>
          <Text className="text-white text-sm mb-1">Routing: {payout?.hasRoutingNumber ? `•••• ${payout.routingLast4}` : "Not set"}</Text>
          <Text className="text-white text-sm">Account: {payout?.hasAccountNumber ? `•••• ${payout.accountLast4}` : "Not set"}</Text>
          <Text className="text-white text-sm mt-1">Tax ID / SSN: {payout?.hasSsn ? `•••• ${payout.ssnLast4}` : "Not set"}</Text>
        </Card>

        <Field label="Legal Name" value={legalName} onChangeText={setLegalName} />
        <Field label="Payout Email" value={email} onChangeText={setEmail} />
        <Field label="Bank Name" value={bankName} onChangeText={setBankName} />
        <Field label="Tax ID / SSN" value={ssn} onChangeText={(value) => setSsn(value.replace(/\D/g, "").slice(0, 9))} placeholder="Enter to update" secure />
        <Field label="Routing Number" value={routingNumber} onChangeText={setRoutingNumber} placeholder="Enter to update" secure />
        <Field label="Account Number" value={accountNumber} onChangeText={setAccountNumber} placeholder="Enter to update" secure />

        {saved ? <Text className="text-success text-sm mb-3 text-center">Saved.</Text> : null}

        <GoldButton label="Save" onPress={handleSave} loading={patchPayout.isPending} />
      </View>
    </ScreenContainer>
  );
}
