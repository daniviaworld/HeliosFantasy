package com.daniviaworld.helios

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private fun score(m: Member, mode: Int): String = when (mode) {
    0 -> m.tot.toString() + " pts"
    1 -> m.j.toString() + " pts"
    else -> eur(m.value)
}

@Composable
private fun PodiumSlot(m: Member, place: Int, me: String, modifier: Modifier, mode: Int, onClick: () -> Unit) {
    val ring = when (place) {
        1 -> Gold
        2 -> Color(0xFFC7D0E6)
        else -> Color(0xFFC98A5B)
    }
    val avatar = if (place == 1) 84 else 66
    val block = if (place == 1) 92.dp else if (place == 2) 66.dp else 54.dp
    val grad = when (place) {
        1 -> Brush.verticalGradient(listOf(Color(0xFFFFE27A), Color(0xFFF2B51D)))
        2 -> Brush.verticalGradient(listOf(Color(0xFFF1F4FB), Color(0xFFBFC8DE)))
        else -> Brush.verticalGradient(listOf(Color(0xFFE8A878), Color(0xFFB9743F)))
    }
    Column(modifier.clickable { onClick() }, horizontalAlignment = Alignment.CenterHorizontally) {
        if (place == 1) {
            Canvas(Modifier.size(30.dp, 18.dp)) {
                val w = size.width
                val h = size.height
                val p = Path()
                p.moveTo(0f, h); p.lineTo(0f, h * 0.2f); p.lineTo(w * 0.25f, h * 0.6f); p.lineTo(w * 0.5f, 0f)
                p.lineTo(w * 0.75f, h * 0.6f); p.lineTo(w, h * 0.2f); p.lineTo(w, h); p.close()
                drawPath(p, Gold)
            }
        }
        Avatar(m.name, avatar, ring)
        Text(m.name, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp), color = if (m.uid == me) Hot else Fg)
        Text(score(m, mode), fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = if (place == 1) 28.sp else 24.sp, maxLines = 1, color = Fg)
        Box(
            Modifier.fillMaxWidth().padding(top = 6.dp).height(block).background(grad, RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp)),
            contentAlignment = Alignment.Center
        ) {
            Text(place.toString(), fontFamily = Display, fontWeight = FontWeight.ExtraBold, fontStyle = FontStyle.Italic, fontSize = 40.sp, color = Color(0xFF1B1400))
        }
    }
}

@Composable
fun StandingsScreen(store: LeagueStore, me: String, onOpenTeam: (String) -> Unit) {
    var mode by remember { mutableStateOf(0) }
    val sorted = when (mode) {
        0 -> store.members.sortedByDescending { it.tot }
        1 -> store.members.sortedByDescending { it.j }
        else -> store.members.sortedByDescending { it.value }
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 12.dp)) {
        Title("Clasificación", store.members.size.toString() + " mánagers")
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip("Puntos", mode == 0, Modifier.weight(1f)) { mode = 0 }
            Chip("Jornada", mode == 1, Modifier.weight(1f)) { mode = 1 }
            Chip("Valor", mode == 2, Modifier.weight(1f)) { mode = 2 }
        }
        if (store.error.isNotEmpty()) { Hint(store.error, true); return@Column }
        if (!store.membersLoaded) { Hint("Cargando…"); return@Column }
        if (sorted.isEmpty()) { Hint("Todavía no hay mánagers en esta liga."); return@Column }

        // Podio: 2º · 1º · 3º
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
            if (sorted.size > 1) PodiumSlot(sorted[1], 2, me, Modifier.weight(1f), mode) { onOpenTeam(sorted[1].uid) } else Box(Modifier.weight(1f))
            PodiumSlot(sorted[0], 1, me, Modifier.weight(1.12f), mode) { onOpenTeam(sorted[0].uid) }
            if (sorted.size > 2) PodiumSlot(sorted[2], 3, me, Modifier.weight(1f), mode) { onOpenTeam(sorted[2].uid) } else Box(Modifier.weight(1f))
        }

        if (sorted.size > 3) {
            Column(
                Modifier.padding(horizontal = 16.dp).fillMaxWidth()
                    .background(Surface1.copy(alpha = 0.85f), RoundedCornerShape(18.dp))
                    .border(1.dp, Line, RoundedCornerShape(18.dp))
            ) {
                for (i in 3 until sorted.size) {
                    val m = sorted[i]
                    val mineRow = m.uid == me
                    Row(
                        Modifier.fillMaxWidth().clickable { onOpenTeam(m.uid) }.padding(horizontal = 12.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(Modifier.size(34.dp).background(Surface2, CircleShape), contentAlignment = Alignment.Center) {
                            Text((i + 1).toString(), color = Muted, fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 18.sp)
                        }
                        Box(Modifier.padding(start = 10.dp)) { Avatar(m.name, 44) }
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                            Text(m.name, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = if (mineRow) Hot else Fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                if (mode == 2) "Caja: " + eur(m.cash) else "Jornada: " + m.j + " pts",
                                color = Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis
                            )
                        }
                        Text(score(m, mode), fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = if (mode == 2) 20.sp else 28.sp, maxLines = 1, textAlign = TextAlign.End)
                    }
                    if (i < sorted.size - 1) Box(Modifier.fillMaxWidth().padding(horizontal = 12.dp).height(1.dp).background(Line))
                }
            }
        }
    }
}
