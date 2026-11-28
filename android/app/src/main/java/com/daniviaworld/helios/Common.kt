package com.daniviaworld.helios

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale

val Gold = Color(0xFFF5C453)
val GreenOk = Color(0xFF2FBF71)
val PitchTop = Color(0xFF1E7A3E)
val PitchBottom = Color(0xFF15592D)

fun posColor(p: String): Color = when (p) {
    "POR" -> Color(0xFFE0A526)
    "DEF" -> Color(0xFF3B82F6)
    "MED" -> Color(0xFF22A06B)
    else -> Color(0xFFE5484D)
}

fun posLabel(p: String): String = when (p) {
    "POR" -> "POR"
    "DEF" -> "DEF"
    "MED" -> "CEN"
    else -> "DEL"
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
    return if (t.length <= 11) t else t.substring(0, 10) + "…"
}

@Composable
fun Title(text: String, sub: String = "") {
    Column(Modifier.padding(horizontal = 18.dp, vertical = 10.dp)) {
        Text(text.uppercase(), fontSize = 28.sp, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, color = Fg)
        if (sub.isNotEmpty()) Text(sub, color = Muted, fontSize = 13.sp)
    }
}

@Composable
fun Chip(text: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier
            .clickable { onClick() }
            .background(if (selected) Hot else Surface1, shape)
            .border(BorderStroke(1.dp, if (selected) Hot else Line), shape)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(text, color = if (selected) Color.White else Muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, textAlign = TextAlign.Center)
    }
}

@Composable
fun PosChip(pos: String) {
    Box(Modifier.background(posColor(pos), RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 2.dp)) {
        Text(posLabel(pos), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun Avatar(name: String, size: Int = 40, highlight: Boolean = false) {
    val colors = listOf(Color(0xFF6D4AFF), Color(0xFF2F7DD1), Color(0xFF1F9D8B), Color(0xFFB5527A), Color(0xFF8A6A2B), Color(0xFF4F6D7A))
    val c = colors[Math.abs(name.hashCode()) % colors.size]
    Box(
        Modifier.size(size.dp).background(c, CircleShape).border(2.dp, if (highlight) Gold else Color.Transparent, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text(name.trim().take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size * 0.42).sp)
    }
}

@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier.fillMaxWidth()
            .background(Surface1, RoundedCornerShape(16.dp))
            .border(1.dp, Line, RoundedCornerShape(16.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) { content() }
}

@Composable
fun Hint(text: String, error: Boolean = false) {
    Text(text, color = if (error) Bad else Muted, fontSize = 14.sp, modifier = Modifier.padding(18.dp), overflow = TextOverflow.Clip)
}
