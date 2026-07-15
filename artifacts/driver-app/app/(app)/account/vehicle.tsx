import { useState } from "react";
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/auth/store";
import { useDriverVehicles, usePostDriverVehicle, useVehicleCatalog } from "@/api/hooks";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { GoldButton } from "@/components/GoldButton";
import { colors } from "@/theme/colors";

const VEHICLE_CLASSES = [
  { value: "standard", label: "Standard Sedan" },
  { value: "business", label: "Business Sedan" },
  { value: "first_class", label: "First Class Sedan" },
  { value: "suv", label: "Premium SUV" },
  { value: "van", label: "Van / Shuttle" },
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: currentYear - 2014 }, (_, i) => currentYear - i);

export default function VehicleScreen() {
  const driverId = useAuthStore((s) => s.driverId);
  const { data: vehicles, isLoading, refetch } = useDriverVehicles(driverId);
  const { data: catalog } = useVehicleCatalog();
  const postVehicle = usePostDriverVehicle(driverId ?? 0);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    make: "",
    model: "",
    year: currentYear,
    color: "",
    regPlate: "",
    vehicleClass: "",
    passengerCapacity: "",
    hasCarSeat: false,
  });

  function setField<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function catalogMatch(): string | null {
    if (!catalog || !form.make.trim() || !form.model.trim()) return null;
    const match = catalog.find(
      e =>
        e.make.toLowerCase() === form.make.trim().toLowerCase() &&
        e.model.toLowerCase() === form.model.trim().toLowerCase(),
    );
    if (!match) return "not_found";
    if (form.year < match.minYear) return `too_old`;
    return "ok";
  }

  const catalogStatus = catalogMatch();

  async function handleSubmit() {
    const { make, model, year, color, regPlate, vehicleClass, passengerCapacity } = form;
    if (!make.trim() || !model.trim() || !color.trim() || !vehicleClass) {
      Alert.alert("Missing fields", "Please fill in make, model, color, and vehicle class.");
      return;
    }
    try {
      await postVehicle.mutateAsync({
        make: make.trim(),
        model: model.trim(),
        year,
        color: color.trim(),
        regPlate: regPlate.trim() || undefined,
        vehicleClass,
        passengerCapacity: passengerCapacity ? parseInt(passengerCapacity) : undefined,
        hasCarSeat: form.hasCarSeat,
        isDefault: true,
      });
      refetch();
      setShowForm(false);
      setForm({ make: "", model: "", year: currentYear, color: "", regPlate: "", vehicleClass: "", passengerCapacity: "", hasCarSeat: false });
      Alert.alert("Vehicle registered", "Your vehicle has been saved and sent for admin review.");
    } catch {
      Alert.alert("Error", "Could not save vehicle. Please try again.");
    }
  }

  const primaryVehicle = vehicles?.find(v => v.isDefault) ?? vehicles?.[0];

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="pt-4">

          {/* Current vehicle info */}
          {isLoading ? (
            <Card className="mb-4">
              <Text className="text-muted text-sm">Loading vehicle info...</Text>
            </Card>
          ) : primaryVehicle ? (
            <Card className="mb-4">
              <Text className="text-muted text-xs uppercase mb-2">Your Registered Vehicle</Text>
              <Text className="text-white font-sans-medium text-base">
                {primaryVehicle.year} {primaryVehicle.make} {primaryVehicle.model}
              </Text>
              <Text className="text-muted text-sm mt-1">{primaryVehicle.color}</Text>
              <View className="flex-row gap-3 mt-3">
                {primaryVehicle.regPlate ? (
                  <View style={{ backgroundColor: colors.surface, padding: 6, borderRadius: 4 }}>
                    <Text className="text-white text-xs font-mono">{primaryVehicle.regPlate}</Text>
                  </View>
                ) : null}
                {primaryVehicle.vehicleClass ? (
                  <View style={{ backgroundColor: colors.surface, padding: 6, borderRadius: 4 }}>
                    <Text className="text-muted text-xs">
                      {VEHICLE_CLASSES.find(c => c.value === primaryVehicle.vehicleClass)?.label ?? primaryVehicle.vehicleClass}
                    </Text>
                  </View>
                ) : null}
                {primaryVehicle.hasCarSeat ? (
                  <View style={{ backgroundColor: colors.surface, padding: 6, borderRadius: 4 }}>
                    <Text className="text-muted text-xs">Car seat available</Text>
                  </View>
                ) : null}
              </View>
            </Card>
          ) : (
            <Card className="mb-4">
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
                <Text className="text-warning text-sm font-sans-medium">No vehicle registered</Text>
              </View>
              <Text className="text-muted text-xs">Register your vehicle below to start accepting rides.</Text>
            </Card>
          )}

          {/* Add / update vehicle */}
          {!showForm ? (
            <GoldButton
              label={primaryVehicle ? "Update Vehicle Info" : "Register Vehicle"}
              onPress={() => {
                if (primaryVehicle) {
                  setForm({
                    make: primaryVehicle.make,
                    model: primaryVehicle.model,
                    // year is stored as text in the DB, so it arrives as a string
                    year: Number(primaryVehicle.year) || currentYear,
                    color: primaryVehicle.color,
                    regPlate: primaryVehicle.regPlate ?? "",
                    vehicleClass: primaryVehicle.vehicleClass ?? "",
                    passengerCapacity: primaryVehicle.passengerCapacity?.toString() ?? "",
                    hasCarSeat: primaryVehicle.hasCarSeat,
                  });
                }
                setShowForm(true);
              }}
            />
          ) : (
            <Card className="gap-4">
              <Text className="text-white font-sans-medium text-base mb-1">Vehicle Details</Text>

              {/* Make */}
              <View>
                <Text className="text-muted text-xs mb-1">Make <Text style={{ color: colors.danger }}>*</Text></Text>
                <TextInput
                  value={form.make}
                  onChangeText={v => setField("make", v)}
                  placeholder="e.g. Mercedes-Benz"
                  placeholderTextColor={colors.muted}
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: "#333", color: colors.white, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderRadius: 4 }}
                />
              </View>

              {/* Model */}
              <View>
                <Text className="text-muted text-xs mb-1">Model <Text style={{ color: colors.danger }}>*</Text></Text>
                <TextInput
                  value={form.model}
                  onChangeText={v => setField("model", v)}
                  placeholder="e.g. S-Class"
                  placeholderTextColor={colors.muted}
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: "#333", color: colors.white, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderRadius: 4 }}
                />
                {/* Catalog status hint */}
                {catalogStatus === "not_found" && form.make.trim() && form.model.trim() ? (
                  <Text className="text-xs mt-1" style={{ color: colors.warning }}>
                    This vehicle isn't in our catalog yet — it will be added for admin review.
                  </Text>
                ) : catalogStatus === "too_old" ? (
                  <Text className="text-xs mt-1" style={{ color: colors.warning }}>
                    Your selected year may be too old for this model in our catalog.
                  </Text>
                ) : catalogStatus === "ok" ? (
                  <Text className="text-xs mt-1" style={{ color: colors.success }}>
                    Vehicle found in catalog.
                  </Text>
                ) : null}
              </View>

              {/* Year */}
              <View>
                <Text className="text-muted text-xs mb-1">Year <Text style={{ color: colors.danger }}>*</Text></Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {YEAR_OPTIONS.map(y => (
                      <TouchableOpacity
                        key={y}
                        onPress={() => setField("year", y)}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 4,
                          borderWidth: 1,
                          borderColor: form.year === y ? colors.gold : "#333",
                          backgroundColor: form.year === y ? colors.gold + "15" : colors.surface,
                        }}
                      >
                        <Text style={{ color: form.year === y ? colors.gold : colors.muted, fontSize: 13 }}>{y}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Color */}
              <View>
                <Text className="text-muted text-xs mb-1">Color <Text style={{ color: colors.danger }}>*</Text></Text>
                <TextInput
                  value={form.color}
                  onChangeText={v => setField("color", v)}
                  placeholder="e.g. Black"
                  placeholderTextColor={colors.muted}
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: "#333", color: colors.white, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderRadius: 4 }}
                />
              </View>

              {/* License plate */}
              <View>
                <Text className="text-muted text-xs mb-1">License Plate</Text>
                <TextInput
                  value={form.regPlate}
                  onChangeText={v => setField("regPlate", v.toUpperCase())}
                  placeholder="e.g. ABC-1234"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="characters"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: "#333", color: colors.white, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontFamily: "monospace", borderRadius: 4 }}
                />
              </View>

              {/* Vehicle class */}
              <View>
                <Text className="text-muted text-xs mb-2">Vehicle Class <Text style={{ color: colors.danger }}>*</Text></Text>
                <View className="gap-2">
                  {VEHICLE_CLASSES.map(cls => (
                    <TouchableOpacity
                      key={cls.value}
                      onPress={() => setField("vehicleClass", cls.value)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: form.vehicleClass === cls.value ? colors.gold : "#333",
                        backgroundColor: form.vehicleClass === cls.value ? colors.gold + "10" : colors.surface,
                      }}
                    >
                      <View style={{
                        width: 16, height: 16, borderRadius: 8, borderWidth: 1.5,
                        borderColor: form.vehicleClass === cls.value ? colors.gold : "#555",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        {form.vehicleClass === cls.value ? (
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold }} />
                        ) : null}
                      </View>
                      <Text style={{ color: form.vehicleClass === cls.value ? colors.white : colors.muted, fontSize: 14 }}>
                        {cls.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Passenger capacity */}
              <View>
                <Text className="text-muted text-xs mb-1">Passenger Capacity</Text>
                <TextInput
                  value={form.passengerCapacity}
                  onChangeText={v => setField("passengerCapacity", v.replace(/\D/g, ""))}
                  placeholder="e.g. 4"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: "#333", color: colors.white, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, borderRadius: 4 }}
                />
              </View>

              {/* Car seat */}
              <TouchableOpacity
                onPress={() => setField("hasCarSeat", !form.hasCarSeat)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
                  borderColor: form.hasCarSeat ? colors.gold : "#555",
                  backgroundColor: form.hasCarSeat ? colors.gold + "20" : "transparent",
                  alignItems: "center", justifyContent: "center",
                }}>
                  {form.hasCarSeat ? <Ionicons name="checkmark" size={12} color={colors.gold} /> : null}
                </View>
                <Text style={{ color: colors.white, fontSize: 14 }}>I have a car seat available</Text>
              </TouchableOpacity>

              {/* Actions */}
              <View className="flex-row gap-3 mt-2">
                <View style={{ flex: 1 }}>
                  <GoldButton
                    label="Save Vehicle"
                    onPress={() => void handleSubmit()}
                    loading={postVehicle.isPending}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setShowForm(false)}
                  style={{ paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: "#333", borderRadius: 4 }}
                >
                  <Text style={{ color: colors.muted }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </Card>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
