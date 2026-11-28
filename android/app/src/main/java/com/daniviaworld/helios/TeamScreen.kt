package com.daniviaworld.helios

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

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
    val inLineup = HashSet<Long>()
    for (pos in POS_ORDER) for (a in (m.lineup[pos] ?: emptyList())) if (a != null) inLineup.add(a)
    val bench = m.squad.filter { !inLineup.contains(it) }
        .mapNotNull { Catalog.players[it] }
        .sortedBy { POS_ORDER.indexOf(it.p) }

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Title(if (m.uid == me) "Mi equipo" else m.name, "Formación " + (if (m.formation.isEmpty()) "–" else m.formation))
        }
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Panel(Modifier.weight(1f)) {
                    Text("Puntos", color = Muted, fontSize = 11.sp)
                    Text(m.tot.toString(), color = Fg, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 22.sp)
                }
                Panel(Modifier.weight(1f)) {
                    Text("Valor", color = Muted, fontSize = 11.sp)
                    Text(eur(m.value), color = Fg, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
                }
                Panel(Modifier.weight(1f)) {
                    Text("Caja", color = Muted, fontSize = 11.sp)
                    Text(eur(m.cash), color = Fg, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
                }
            }
        }
        item {
            // Campo: delanteros arriba, portero abajo
            Column(
                Modifier.padding(horizontal = 18.dp).fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(PitchTop, PitchBottom)), RoundedCornerShape(20.dp))
                    .border(2.dp, Color(0x33FFFFFF), RoundedCornerShape(20.dp))
                    .padding(vertical = 14.dp, horizontal = 6.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                for (pos in listOf("DEL", "MED", "DEF", "POR")) {
                    val slots = m.lineup[pos] ?: emptyList()
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                        if (slots.isEmpty()) Box(Modifier.height(78.dp))
                        for (a in slots) PlayerTile(if (a == null) null else Catalog.players[a], pos)
                    }
                }
            }
        }
        item {
            Text(
                "SUPLENTES Y RESTO DE PLANTILLA (" + bench.size + ")",
                color = Muted, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 6.dp)
            )
        }
        items(bench, key = { it.a }) { p ->
            Row(
                Modifier.padding(horizontal = 18.dp).fillMaxWidth()
                    .background(Surface1, RoundedCornerShape(14.dp))
                    .border(1.dp, Line, RoundedCornerShape(14.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                PosChip(p.p)
                Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                    Text(p.n, color = Fg, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(Catalog.teamName(p.t) + " · " + eur(p.v), color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text((Catalog.pts[p.a] ?: 0).toString() + " pts", color = Fg, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 16.sp)
            }
        }
        item {
            val others = store.members.filter { it.uid != viewUid }
            if (others.isNotEmpty()) {
                Column(Modifier.padding(horizontal = 18.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("VER EL EQUIPO DE…", color = Muted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    for (o in others) {
                        Chip(if (o.uid == me) "Mi equipo" else o.name, false, Modifier.fillMaxWidth()) { onPick(o.uid) }
                    }
                }
            }
        }
        item { Box(Modifier.height(12.dp)) }
    }
}

@Composable
fun PlayerTile(p: Pl?, slotPos: String) {
    Column(
        Modifier.width(72.dp)
            .background(Color(0xE60B1530), RoundedCornerShape(12.dp))
            .border(2.dp, posColor(p?.p ?: slotPos), RoundedCornerShape(12.dp))
            .padding(vertical = 6.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        PosChip(p?.p ?: slotPos)
        Text(
            if (p == null) "—" else shortName(p.n),
            color = Fg, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
            maxLines = 1, textAlign = TextAlign.Center, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 3.dp)
        )
        Text(
            if (p == null) "" else (Catalog.pts[p.a] ?: 0).toString(),
            color = Gold, fontSize = 15.sp, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic
        )
    }
}
