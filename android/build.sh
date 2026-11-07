#!/usr/bin/env bash
# Crea TavoloDnD.apk (app Android del tavolo) senza Android Studio: gli strumenti arrivano da Maven Central.
#   aapt2 e risorse del framework: apktool-lib · classi di Android per compilare: robolectric android-all
#   dex: dalvik-dx · firma: apksig
# Serve solo Java (JDK 17 o più recente). App per Android 8 o più recente. Uso: bash android/build.sh
set -euo pipefail
cd "$(dirname "$0")"
M=https://repo.maven.apache.org/maven2
T=.tools; B=.build
mkdir -p "$T"
get() { [ -s "$T/$2" ] || curl -sSfL --retry 4 -o "$T/$2" "$M/$1"; }
get org/apktool/apktool-lib/3.0.3/apktool-lib-3.0.3.jar apktool-lib.jar
get org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar android-all.jar
get com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar dx.jar
get com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar apksig.jar
if [ ! -x "$T/aapt2" ]; then
  unzip -oqj "$T/apktool-lib.jar" prebuilt/linux/aapt2 prebuilt/android-framework.jar -d "$T"
  chmod +x "$T/aapt2"
fi

rm -rf "$B"; mkdir -p "$B/res" "$B/classes" "$B/gen" "$B/sign"
# risorse e manifest
"$T/aapt2" compile --dir res -o "$B/res.zip"
"$T/aapt2" link -o "$B/base.apk" -I "$T/android-framework.jar" --manifest AndroidManifest.xml -A assets \
  --min-sdk-version 26 --target-sdk-version 29 --version-code "${VERSION_CODE:-1}" --version-name "${VERSION_NAME:-0.0.3}" \
  --java "$B/gen" "$B/res.zip"
# codice
javac -nowarn --release 8 -cp "$T/android-all.jar" -d "$B/classes" $(find src "$B/gen" -name '*.java') 2>&1 | grep -v "^warning\|^1 warning\|bootstrap" || true
[ -f "$B/classes/it/tavolo/dnd35/MainActivity.class" ] || { echo "Compilazione non riuscita"; exit 1; }
java -cp "$T/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=26 --output="$B/classes.dex" "$B/classes"
cp "$B/base.apk" "$B/unsigned.apk"
(cd "$B" && zip -q unsigned.apk classes.dex)
# firma: la chiave resta in android/tavolo.keystore (fuori da git). Con la stessa chiave l'app si aggiorna senza disinstallarla.
[ -f tavolo.keystore ] || keytool -genkeypair -keystore tavolo.keystore -storetype PKCS12 -storepass tavolo -keypass tavolo \
  -alias tavolo -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Tavolo DnD" 2>/dev/null
javac -nowarn -cp "$T/apksig.jar" -d "$B/sign" tools-src/Sign.java
java --add-exports java.base/sun.security.x509=ALL-UNNAMED -cp "$T/apksig.jar:$B/sign" Sign tavolo.keystore tavolo "$B/unsigned.apk" TavoloDnD.apk
echo "Creato android/TavoloDnD.apk"
