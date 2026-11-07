// App Android del tavolo: il tavolo resta acceso sul PC di casa, il telefono lo apre a tutto schermo.
// Al primo avvio chiede l'indirizzo (quello di "📡 Giocatori" sul PC) e se lo ricorda.
package it.tavolo.dnd35;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import org.json.JSONObject;

public class MainActivity extends Activity {
  private static final String START = "file:///android_asset/start.html";
  private static final int PICK_FILE = 1;
  private WebView web;
  private SharedPreferences prefs;
  private ValueCallback<Uri[]> pending; // la pagina aspetta il file scelto (ritratto, backup da ripristinare)
  private String lastError = "";

  @Override protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    prefs = getSharedPreferences("tavolo", MODE_PRIVATE);
    Window w = getWindow();
    w.setStatusBarColor(Color.parseColor("#0d0f15"));
    w.setNavigationBarColor(Color.parseColor("#0d0f15"));

    web = new WebView(this);
    web.setBackgroundColor(Color.parseColor("#0d0f15"));
    setContentView(web);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true); // le preferenze della pagina (zoom della mappa, griglia, ...)
    s.setMediaPlaybackRequiresUserGesture(false);
    CookieManager.getInstance().setAcceptCookie(true); // l'accesso resta anche chiudendo l'app

    web.addJavascriptInterface(new Bridge(), "Tavolo");
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if (u.toString().startsWith(base()) || u.getScheme().equals("file")) return false;
        // i link verso fuori (per esempio nelle note) si aprono nel browser
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* nessuna app per aprirlo */ }
        return true;
      }
      @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
        if (!r.isForMainFrame()) return;
        // tavolo spento, Wi-Fi diverso o indirizzo sbagliato: si torna alla pagina dell'indirizzo con l'errore
        lastError = "Il tavolo non risponde a " + base() + " (" + e.getDescription() + ")";
        v.loadUrl(START);
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
        if (pending != null) pending.onReceiveValue(null);
        pending = cb;
        try { startActivityForResult(p.createIntent(), PICK_FILE); }
        catch (Exception e) { pending = null; return false; }
        return true;
      }
    });
    // il backup (💾 Backup → Scarica) va nella cartella Download del telefono
    web.setDownloadListener(new android.webkit.DownloadListener() {
      @Override public void onDownloadStart(String url, String ua, String disposition, String mime, long length) { download(url, ua, disposition, mime); }
    });

    if (saved != null) web.restoreState(saved);
    else if (base().isEmpty()) web.loadUrl(START);
    else web.loadUrl(base() + "/");
  }

  private String base() { return prefs.getString("url", ""); }

  private void download(String url, String ua, String disposition, String mime) {
    if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE }, 2);
      Toast.makeText(this, "Consenti l'accesso ai file e premi di nuovo Scarica", Toast.LENGTH_LONG).show();
      return;
    }
    String name = URLUtil.guessFileName(url, disposition, mime);
    DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
    r.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url)); // il backup lo scarica solo chi è entrato
    r.addRequestHeader("User-Agent", ua);
    r.setMimeType(mime);
    r.setTitle(name);
    r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
    r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
    ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
    Toast.makeText(this, "Backup salvato in Download: " + name, Toast.LENGTH_LONG).show();
  }

  @Override protected void onActivityResult(int req, int res, Intent data) {
    if (req != PICK_FILE || pending == null) { super.onActivityResult(req, res, data); return; }
    pending.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
    pending = null;
  }

  // Indietro: prima nella pagina, poi alla pagina dell'indirizzo, poi esce.
  @Override public void onBackPressed() {
    if (web.canGoBack()) web.goBack();
    else if (!START.equals(web.getUrl())) { lastError = ""; web.loadUrl(START); }
    else super.onBackPressed();
  }

  @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
  @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); }

  // Usato dalla pagina dell'indirizzo (assets/start.html).
  private class Bridge {
    @JavascriptInterface public String state() {
      try { return new JSONObject().put("url", base()).put("error", lastError).toString(); } catch (Exception e) { return "{}"; }
    }
    @JavascriptInterface public void open(String url) {
      String u = url.trim();
      if (!u.matches("^https?://.*")) u = "http://" + u;
      if (!u.matches("^https?://[^/]+:\\d+.*")) u = u.replaceFirst("^(https?://[^/]+)", "$1:3000"); // porta del tavolo
      u = u.replaceAll("/+$", "");
      prefs.edit().putString("url", u).apply();
      lastError = "";
      final String go = u + "/";
      runOnUiThread(new Runnable() { @Override public void run() { web.clearHistory(); web.loadUrl(go); } });
    }
  }
}
