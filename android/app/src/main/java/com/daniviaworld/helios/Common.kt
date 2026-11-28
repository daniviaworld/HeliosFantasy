package com.daniviaworld.helios

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import java.util.Locale

val Gold = Color(0xFFFFD400)
val GreenOk = Color(0xFF3CCB7A)
val PitchTop = Color(0xFF226640)
val PitchBottom = Color(0xFF1E5A3A)
const val IMGP = "https://media.api-sports.io/football/"

fun posColor(p: String): Color = when (p) {
    "POR" -> Color(0xFFB36B00)
    "DEF" -> Color(0xFF2B5FC4)
    "MED" -> Color(0xFF1B7A45)
    else -> Color(0xFFB83229)
}

fun posLabel(p: String): String = when (p) {
    "MED" -> "CEN"
    else -> p
}

/** Mismo cálculo que la web: color de camiseta / escudo según el código del club. */
fun hueOf(t: String): Float {
    var h = 0
    for (c in t) h = (h * 31 + c.code) % 360
    return h.toFloat()
}

/** Categoría de la carta según el valor (millones): élite, oro, plata, bronce. */
fun tierColor(v: Double): Color = when {
    v >= 50 -> Color(0xFF7EF0FF)
    v >= 15 -> Color(0xFFF5C453)
    v >= 3 -> Color(0xFFC7D0E6)
    else -> Color(0xFFC98A5B)
}

/** Millones -> "52.000.000 €" */
fun eur(millions: Double): String {
    val n = Math.round(millions * 1_000_000.0)
    return String.format(Locale.US, "%,d", n).replace(',', '.') + " €"
}

fun fmtDate(ts: Long): String {
    val c = java.util.Calendar.getInstance()
    c.timeInMillis = ts
    fun p(n: Int) = n.toString().padStart(2, '0')
    return p(c.get(java.util.Calendar.DAY_OF_MONTH)) + "/" + p(c.get(java.util.Calendar.MONTH) + 1) + " " +
        p(c.get(java.util.Calendar.HOUR_OF_DAY)) + ":" + p(c.get(java.util.Calendar.MINUTE))
}

fun shortName(n: String): String {
    val t = n.trim()
    return if (t.length <= 12) t else t.substring(0, 11) + "…"
}

@Composable
fun Title(text: String, sub: String = "") {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text(
            text.uppercase(), fontFamily = Display, fontSize = 34.sp, lineHeight = 34.sp,
            fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, color = Fg
        )
        if (sub.isNotEmpty()) Text(sub, color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
fun Chip(text: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier
            .clip(shape)
            .clickable { onClick() }
            .then(if (selected) Modifier.background(BrandBrush, shape) else Modifier.background(Surface1.copy(alpha = 0.6f), shape))
            .border(BorderStroke(1.dp, if (selected) Color.Transparent else Line), shape)
            .padding(vertical = 11.dp, horizontal = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text, color = if (selected) Color(0xFF1B0404) else Fg, fontSize = 14.sp,
            fontWeight = FontWeight.Bold, maxLines = 1, textAlign = TextAlign.Center, overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
fun PosChip(pos: String) {
    Box(Modifier.background(posColor(pos), RoundedCornerShape(6.dp)).padding(horizontal = 7.dp, vertical = 2.dp)) {
        Text(posLabel(pos), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, fontFamily = Display, fontStyle = FontStyle.Italic)
    }
}

@Composable
fun Avatar(name: String, size: Int = 40, ring: Color = Color.Transparent) {
    val c = hslColor(hueOf(name), 0.45f, 0.38f)
    Box(
        Modifier.size(size.dp).background(c, CircleShape).border(3.dp, ring, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text(
            name.trim().take(1).uppercase(), color = Color.White, fontFamily = Display, fontStyle = FontStyle.Italic,
            fontWeight = FontWeight.Bold, fontSize = (size * 0.46).sp
        )
    }
}

@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier.fillMaxWidth()
            .background(Surface1.copy(alpha = 0.85f), RoundedCornerShape(18.dp))
            .border(1.dp, Line, RoundedCornerShape(18.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) { content() }
}

@Composable
fun Hint(text: String, error: Boolean = false) {
    Text(text, color = if (error) Bad else Muted, fontSize = 14.sp, modifier = Modifier.padding(18.dp), overflow = TextOverflow.Clip)
}

/** Escudo: el logo real del club si carga; si no, escudo con el código sobre el color del club. */
@Composable
fun Crest(code: String, size: Dp = 22.dp) {
    val logo = Catalog.teams[code]?.logo ?: 0L
    var ok by remember(code) { mutableStateOf(false) }
    Box(Modifier.size(size, size * 1.08f), contentAlignment = Alignment.Center) {
        if (!ok) {
            val fill = hslColor(hueOf(code), 0.58f, 0.38f)
            Canvas(Modifier.fillMaxSize()) {
                val w = this.size.width
                val h = this.size.height
                val path = Path()
                path.moveTo(w * 0.5f, h * 0.04f)
                path.lineTo(w * 0.92f, h * 0.17f)
                path.lineTo(w * 0.92f, h * 0.5f)
                path.cubicTo(w * 0.92f, h * 0.78f, w * 0.7f, h * 0.9f, w * 0.5f, h * 0.97f)
                path.cubicTo(w * 0.3f, h * 0.9f, w * 0.08f, h * 0.78f, w * 0.08f, h * 0.5f)
                path.lineTo(w * 0.08f, h * 0.17f)
                path.close()
                drawPath(path, fill)
                drawPath(path, Color.White, style = Stroke(width = w * 0.06f))
            }
            Text(code, color = Color.White, fontSize = (size.value * 0.3f).sp, fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, maxLines = 1)
        }
        if (logo > 0L) {
            AsyncImage(
                model = IMGP + "teams/" + logo + ".png",
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit,
                onSuccess = { ok = true }
            )
        }
    }
}

/** Camiseta con cuello en V y foto del jugador encima, igual que la web. */
@Composable
fun PlayerArt(p: Pl?, modifier: Modifier = Modifier, showNum: Boolean = true) {
    val h = hueOf(p?.t ?: "X")
    val top = hslColor(h, 0.55f, 0.34f)
    val bottom = hslColor(h, 0.62f, 0.16f)
    val shirt = hslColor(h, 0.68f, 0.5f)
    Box(modifier.background(Brush.linearGradient(listOf(top, bottom))), contentAlignment = Alignment.BottomCenter) {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width
            val hh = size.height
            drawCircle(Color.White.copy(alpha = 0.88f), radius = w * 0.2f, center = Offset(w * 0.5f, hh * 0.33f))
            val sh = Path()
            sh.moveTo(w * 0.05f, hh)
            sh.cubicTo(w * 0.05f, hh * 0.78f, w * 0.25f, hh * 0.65f, w * 0.5f, hh * 0.65f)
            sh.cubicTo(w * 0.75f, hh * 0.65f, w * 0.95f, hh * 0.78f, w * 0.95f, hh)
            sh.close()
            drawPath(sh, shirt)
            val v = Path()
            v.moveTo(w * 0.35f, hh * 0.67f)
            v.lineTo(w * 0.5f, hh * 0.79f)
            v.lineTo(w * 0.65f, hh * 0.67f)
            drawPath(v, Color.White.copy(alpha = 0.75f), style = Stroke(width = w * 0.04f, cap = StrokeCap.Round))
        }
        if (p != null && p.a > 0L) {
            AsyncImage(
                model = IMGP + "players/" + p.a + ".png",
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                alignment = Alignment.TopCenter
            )
        }
        if (showNum && p != null && p.num > 0) {
            Text(
                p.num.toString(), color = Color.White, fontFamily = Display, fontWeight = FontWeight.Bold,
                fontStyle = FontStyle.Italic, fontSize = 14.sp, modifier = Modifier.padding(bottom = 2.dp)
            )
        }
    }
}

/** Icono de la barra inferior (trazo, como en la web). */
@Composable
fun NavIcon(kind: Int, color: Color) {
    Canvas(Modifier.size(24.dp)) {
        val s = size.width / 24f
        val st = Stroke(width = 1.9f * s, cap = StrokeCap.Round)
        fun pt(x: Float, y: Float) = Offset(x * s, y * s)
        when (kind) {
            0 -> { // trofeo
                val p = Path()
                p.moveTo(7 * s, 4 * s); p.lineTo(17 * s, 4 * s); p.lineTo(17 * s, 9 * s)
                p.cubicTo(17 * s, 12 * s, 15 * s, 14 * s, 12 * s, 14 * s)
                p.cubicTo(9 * s, 14 * s, 7 * s, 12 * s, 7 * s, 9 * s); p.close()
                drawPath(p, color, style = st)
                drawLine(color, pt(12f, 14f), pt(12f, 18f), strokeWidth = 1.9f * s, cap = StrokeCap.Round)
                drawLine(color, pt(8f, 20f), pt(16f, 20f), strokeWidth = 1.9f * s, cap = StrokeCap.Round)
            }
            1 -> { // barras
                drawLine(color, pt(5f, 20f), pt(5f, 10f), strokeWidth = 2.2f * s, cap = StrokeCap.Round)
                drawLine(color, pt(12f, 20f), pt(12f, 4f), strokeWidth = 2.2f * s, cap = StrokeCap.Round)
                drawLine(color, pt(19f, 20f), pt(19f, 12f), strokeWidth = 2.2f * s, cap = StrokeCap.Round)
            }
            2 -> { // campo
                drawRoundRect(color, topLeft = pt(3f, 5f), size = androidx.compose.ui.geometry.Size(18 * s, 14 * s), cornerRadius = androidx.compose.ui.geometry.CornerRadius(2 * s, 2 * s), style = st)
                drawLine(color, pt(12f, 5f), pt(12f, 19f), strokeWidth = 1.9f * s)
                drawCircle(color, radius = 2.4f * s, center = pt(12f, 12f), style = st)
            }
            3 -> { // intercambio
                drawLine(color, pt(4f, 8f), pt(18f, 8f), strokeWidth = 1.9f * s, cap = StrokeCap.Round)
                drawLine(color, pt(18f, 8f), pt(15f, 5f), strokeWidth = 1.9f * s, cap = StrokeCap.Round)
                drawLine(color, pt(20f, 16f), pt(6f, 16f), strokeWidth = 1.9f * s, cap = StrokeCap.Round)
                drawLine(color, pt(6f, 16f), pt(9f, 19f), strokeWidth = 1.9f * s, cap = StrokeCap.Round)
            }
            else -> { // portapapeles
                drawRoundRect(color, topLeft = pt(6f, 4f), size = androidx.compose.ui.geometry.Size(12 * s, 17 * s), cornerRadius = androidx.compose.ui.geometry.CornerRadius(2 * s, 2 * s), style = st)
                drawLine(color, pt(9f, 12f), pt(15f, 12f), strokeWidth = 1.9f * s, cap = StrokeCap.Round)
                drawLine(color, pt(9f, 16f), pt(15f, 16f), strokeWidth = 1.9f * s, cap = StrokeCap.Round)
            }
        }
    }
}

fun hslColor(h: Float, s: Float, l: Float): Color {
    val c = (1f - Math.abs(2f * l - 1f)) * s
    val hp = (h % 360f) / 60f
    val x = c * (1f - Math.abs(hp % 2f - 1f))
    var r = 0f
    var g = 0f
    var b = 0f
    when {
        hp < 1f -> { r = c; g = x }
        hp < 2f -> { r = x; g = c }
        hp < 3f -> { g = c; b = x }
        hp < 4f -> { g = x; b = c }
        hp < 5f -> { r = x; b = c }
        else -> { r = c; b = x }
    }
    val m = l - c / 2f
    return Color(r + m, g + m, b + m, 1f)
}
