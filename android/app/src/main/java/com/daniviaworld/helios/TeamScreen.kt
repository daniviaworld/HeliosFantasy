package com.daniviaworld.helios

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val FORMATIONS = listOf(listOf("4-4-2", "4-3-3", "3-5-2", "3-4-3"), listOf("4-5-1", "5-3-2", "5-4-1"))

@Composable
fun TeamScreen(store: LeagueStore, viewUid: String, me: String, onPick: (String) -> Unit) {
    val m = store.members.firstOrNull { it.uid == viewUid }
    if (!Catalog.loaded) {
        Hint(if (Catalog.error.isNotEmpty()) Catalog.error else "Cargando jugadores de LaLiga…", Catalog.error.isNotEmpty())
        return
    }
    if (m == null) {
        Hint(if (store.membersLoaded) "No se encontró este equipo." else "Cargando…")
        return
    }
    var sub by remember { mutableStateOf(0) }
    val inLineup = HashSet<Long>()
    for (pos in POS_ORDER) for (a in (m.lineup[pos] ?: emptyList())) if (a != null) inLineup.add(a)
    val squadPl = m.squad.mapNotNull { Catalog.players[it] }.sortedBy { POS_ORDER.indexOf(it.p) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 12.dp)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Column {
                Text("PLANTILLA", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(m.squad.size.toString() + "/26", fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 22.sp)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("PUNTOS", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(m.tot.toString(), fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 22.sp)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("VALOR EQUIPO", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(eur(m.value), fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 22.sp)
            }
        }
        if (m.uid != me) {
            Text(m.name, color = Hot, fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 20.sp, modifier = Modifier.padding(horizontal = 16.dp))
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
            for ((i, t) in listOf("Alineación", "Plantilla").withIndex()) {
                Column(Modifier.clickable { sub = i }) {
                    Text(
                        t.uppercase(), fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 28.sp,
                        color = if (sub == i) Fg else Muted
                    )
                    Box(Modifier.width(if (sub == i) 120.dp else 0.dp).height(3.dp).background(BrandBrush))
                }
            }
        }

        if (sub == 0) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (row in FORMATIONS) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (f in row) Chip(f, f == m.formation, Modifier.weight(1f)) { }
                        if (row.size < 4) Box(Modifier.weight((4 - row.size).toFloat()))
                    }
                }
            }
            Pitch(m)
        } else {
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (p in squadPl) {
                    Row(
                        Modifier.fillMaxWidth()
                            .background(Surface1.copy(alpha = 0.85f), RoundedCornerShape(14.dp))
                            .border(1.dp, Line, RoundedCornerShape(14.dp))
                            .padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        PlayerArt(p, Modifier.size(40.dp, 48.dp).clip(RoundedCornerShape(8.dp)).border(2.dp, tierColor(p.v), RoundedCornerShape(8.dp)), false)
                        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                            Text(p.n, fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Crest(p.t, 16.dp)
                                Text(p.t, color = Muted, fontSize = 12.sp)
                                PosChip(p.p)
                                if (inLineup.contains(p.a)) Text("Titular", color = GreenOk, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text((Catalog.pts[p.a] ?: 0).toString(), fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 24.sp)
                            Text(eur(p.v), color = Muted, fontSize = 11.sp)
                        }
                    }
                }
            }
        }

        val others = store.members.filter { it.uid != viewUid }
        if (others.isNotEmpty()) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("VER EL EQUIPO DE…", color = Muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                for (o in others) {
                    Chip(if (o.uid == me) "Mi equipo" else o.name, false, Modifier.fillMaxWidth()) { onPick(o.uid) }
                }
            }
        }
    }
}

@Composable
private fun Pitch(m: Member) {
    BoxWithConstraints(
        Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth()
            .clip(RoundedCornerShape(26.dp))
            .background(Brush.verticalGradient(listOf(PitchTop, PitchBottom)))
            .border(2.dp, Color(0x40FFFFFF), RoundedCornerShape(26.dp))
    ) {
        val cardW: Dp = minOf(86.dp, (maxWidth - 28.dp) / 5)
        val cardH = cardW * 1.4f
        Canvas(Modifier.matchParentSize()) {
            val w = size.width
            val h = size.height
            val st = Stroke(width = 2f)
            val c = Color(0x55FFFFFF)
            drawRect(c, topLeft = Offset(w * 0.05f, h * 0.02f), size = androidx.compose.ui.geometry.Size(w * 0.9f, h * 0.96f), style = st)
            drawLine(c, Offset(w * 0.05f, h * 0.5f), Offset(w * 0.95f, h * 0.5f), strokeWidth = 2f)
            drawCircle(c, radius = w * 0.14f, center = Offset(w * 0.5f, h * 0.5f), style = st)
            drawRect(c, topLeft = Offset(w * 0.28f, h * 0.02f), size = androidx.compose.ui.geometry.Size(w * 0.44f, h * 0.12f), style = st)
            drawRect(c, topLeft = Offset(w * 0.28f, h * 0.86f), size = androidx.compose.ui.geometry.Size(w * 0.44f, h * 0.12f), style = st)
        }
        Column(Modifier.fillMaxWidth().padding(vertical = 18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            for (pos in listOf("DEL", "MED", "DEF", "POR")) {
                val slots = m.lineup[pos] ?: emptyList()
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    if (slots.isEmpty()) Box(Modifier.height(cardH))
                    for (a in slots) PlayerCard(if (a == null) null else Catalog.players[a], pos, cardW, cardH)
                }
            }
        }
    }
}

@Composable
fun PlayerCard(p: Pl?, slotPos: String, w: Dp, h: Dp) {
    val shape = RoundedCornerShape(12.dp)
    val pos = p?.p ?: slotPos
    Box(
        Modifier.size(w, h).clip(shape)
            .border(2.dp, if (p == null) Color(0x66FFFFFF) else tierColor(p.v), shape)
    ) {
        if (p == null) {
            Box(Modifier.fillMaxSize().background(Color(0x22FFFFFF)), contentAlignment = Alignment.Center) {
                Text("+", color = Color(0xCCFFFFFF), fontSize = 26.sp)
            }
        } else {
            PlayerArt(p, Modifier.fillMaxSize(), false)
            Box(Modifier.align(Alignment.TopStart).background(posColor(pos), RoundedCornerShape(topStart = 10.dp, bottomEnd = 10.dp)).padding(horizontal = 6.dp, vertical = 2.dp)) {
                Text(posLabel(pos), color = Color.White, fontSize = 11.sp, fontFamily = Display, fontWeight = FontWeight.ExtraBold, fontStyle = FontStyle.Italic)
            }
            Box(Modifier.align(Alignment.TopEnd).padding(3.dp)) { Crest(p.t, 18.dp) }
            Text(
                (Catalog.pts[p.a] ?: 0).toString(), color = Color.White, fontFamily = Display, fontWeight = FontWeight.ExtraBold,
                fontStyle = FontStyle.Italic, fontSize = 17.sp, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 22.dp)
            )
            Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color(0xDD0B1226)).padding(vertical = 3.dp), contentAlignment = Alignment.Center) {
                Text(shortName(p.n), color = Color.White, fontFamily = Display, fontWeight = FontWeight.ExtraBold, fontStyle = FontStyle.Italic, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Clip, textAlign = TextAlign.Center)
            }
        }
    }
}
