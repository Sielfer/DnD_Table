// Firma l'APK (schemi v1 e v2) con la chiave del keystore PKCS12: java Sign <keystore> <password> <in.apk> <out.apk>
import com.android.apksig.ApkSigner;
import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

public class Sign {
  public static void main(String[] a) throws Exception {
    KeyStore ks = KeyStore.getInstance("PKCS12");
    try (FileInputStream in = new FileInputStream(a[0])) { ks.load(in, a[1].toCharArray()); }
    String alias = ks.aliases().nextElement();
    PrivateKey key = (PrivateKey) ks.getKey(alias, a[1].toCharArray());
    X509Certificate cert = (X509Certificate) ks.getCertificate(alias);
    ApkSigner.SignerConfig sc = new ApkSigner.SignerConfig.Builder("tavolo", key, Collections.singletonList(cert)).build();
    new ApkSigner.Builder(Collections.singletonList(sc)).setInputApk(new File(a[2])).setOutputApk(new File(a[3])).setMinSdkVersion(26).setV1SigningEnabled(false).setV2SigningEnabled(true).build().sign(); // da Android 8 basta la v2
  }
}
