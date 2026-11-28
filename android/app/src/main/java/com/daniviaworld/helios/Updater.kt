package com.daniviaworld.helios

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Busca la última release de GitHub y, si es más nueva, la descarga e instala. */
object Updater {
    private const val API = "https://api.github.com/repos/daniviaworld/HeliosFantasy/releases/latest"

    var newVersion by mutableStateOf("")
    var apkUrl by mutableStateOf("")
    var notes by mutableStateOf("")
    var progress by mutableStateOf(-1)      // -1 = sin descargar, 0..100 = descargando
    var message by mutableStateOf("")
    var dismissed by mutableStateOf(false)
    private var checked = false

    fun currentVersion(ctx: Context): String =
        try { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "0" } catch (e: Exception) { "0" }

    private fun parts(v: String): List<Int> =
        v.trim().trimStart('v', 'V').split('.').map { it.filter { c -> c.isDigit() }.toIntOrNull() ?: 0 }

    fun isNewer(remote: String, local: String): Boolean {
        val a = parts(remote)
        val b = parts(local)
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    suspend fun check(ctx: Context) {
        if (checked) return
        checked = true
        try {
            val json = withContext(Dispatchers.IO) {
                val c = URL(API).openConnection() as HttpURLConnection
                c.connectTimeout = 10000
                c.readTimeout = 10000
                c.setRequestProperty("Accept", "application/vnd.github+json")
                try { c.inputStream.bufferedReader().readText() } finally { c.disconnect() }
            }
            val o = JSONObject(json)
            val tag = o.optString("tag_name")
            val assets = o.optJSONArray("assets")
            var url = ""
            if (assets != null) {
                for (i in 0 until assets.length()) {
                    val a = assets.getJSONObject(i)
                    if (a.optString("name").endsWith(".apk")) url = a.optString("browser_download_url")
                }
            }
            if (url.isNotEmpty() && isNewer(tag.substringAfterLast('v'), currentVersion(ctx))) {
                newVersion = tag.substringAfterLast('v')
                apkUrl = url
                notes = o.optString("body")
            }
        } catch (e: Exception) {
            // sin conexión o sin releases: no molestamos
        }
    }

    suspend fun downloadAndInstall(ctx: Context) {
        message = ""
        if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
            message = "Activa «Permitir de esta fuente» para Helios y vuelve a pulsar Actualizar."
            val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.packageName))
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
            return
        }
        progress = 0
        try {
            val file = withContext(Dispatchers.IO) {
                val dir = File(ctx.cacheDir, "updates")
                dir.mkdirs()
                val f = File(dir, "helios.apk")
                val c = URL(apkUrl).openConnection() as HttpURLConnection
                c.connectTimeout = 15000
                c.readTimeout = 30000
                c.instanceFollowRedirects = true
                val total = c.contentLength
                var done = 0L
                c.inputStream.use { ins ->
                    f.outputStream().use { out ->
                        val buf = ByteArray(32 * 1024)
                        while (true) {
                            val n = ins.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            done += n
                            if (total > 0) progress = (done * 100 / total).toInt()
                        }
                    }
                }
                c.disconnect()
                f
            }
            val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".fileprovider", file)
            val i = Intent(Intent.ACTION_VIEW)
            i.setDataAndType(uri, "application/vnd.android.package-archive")
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
            progress = -1
        } catch (e: Exception) {
            progress = -1
            message = "No se pudo descargar la actualización. Inténtalo de nuevo."
        }
    }
}
