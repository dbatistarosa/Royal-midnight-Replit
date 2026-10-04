import { Image, ImageBackground, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

const launchBackground = require("../../assets/launch-background-v2.png");
const royalMidnightLogo = require("../../assets/royal-midnight-logo-transparent.png");

export function LaunchExperience() {
  return (
    <ImageBackground
      source={launchBackground}
      resizeMode="cover"
      style={styles.container}
      imageStyle={styles.backgroundImage}
    >
      <StatusBar style="light" />
      <View pointerEvents="none" style={styles.navyWash} />
      <View pointerEvents="none" style={styles.topShade} />

      <View style={styles.brandBlock}>
        <Image
          accessibilityIgnoresInvertColors
          source={royalMidnightLogo}
          resizeMode="contain"
          style={styles.logo}
        />
        <View style={styles.driverRow}>
          <View style={styles.goldRule} />
          <Text style={styles.driverLabel}>DRIVER</Text>
          <View style={styles.goldRule} />
        </View>
        <Text style={styles.tagline}>PROFESSIONAL CHAUFFEUR EXPERIENCE</Text>
      </View>

      <View style={styles.loadingTrack}>
        <View style={styles.loadingFill} />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#06101f",
    alignItems: "center",
  },
  backgroundImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    resizeMode: "cover",
  },
  navyWash: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(2, 10, 24, 0.16)",
  },
  topShade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "49%",
    backgroundColor: "rgba(2, 10, 24, 0.34)",
  },
  brandBlock: {
    position: "absolute",
    top: "8%",
    width: "92%",
    alignItems: "center",
  },
  logo: {
    width: "88%",
    height: 258,
    objectFit: "contain",
    resizeMode: "contain",
  },
  driverRow: {
    width: "72%",
    marginTop: -15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  goldRule: {
    height: 1,
    flex: 1,
    backgroundColor: "rgba(224, 190, 91, 0.82)",
  },
  driverLabel: {
    color: "#f1d374",
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    letterSpacing: 7,
    marginHorizontal: 14,
  },
  tagline: {
    color: "rgba(255, 255, 255, 0.86)",
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 2.3,
    marginTop: 10,
  },
  loadingTrack: {
    position: "absolute",
    bottom: 34,
    width: 84,
    height: 2,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  loadingFill: {
    width: "68%",
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#e0be5b",
  },
});
