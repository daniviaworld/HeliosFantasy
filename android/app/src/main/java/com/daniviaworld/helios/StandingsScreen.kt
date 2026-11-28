package com.daniviaworld.helios

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun StandingsScreen(store: LeagueStore, me: String, onOpenTeam: (String) -> Unit) {
    var mode by remember { mutableStateOf(0) }
    val sorted = when (mode) {
        0 -> store.members.sortedByDescending { it.tot }
        1 -> store.members.sortedByDescending { it.j }
        else -> store.members.sortedByDescending { it.value }
    }
    Column(Modifier.fillMaxSize()) {
        Title("Clasificación", store.members.size.toString() + " mánagers")
        Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip("Puntos", mode == 0, Modifier.weight(1f)) { mode = 0 }
            Chip("Jornada", mode == 1, Modifier.weight(1f)) { mode = 1 }
            Chip("Valor", mode == 2, Modifier.weight(1f)) { mode = 2 }
        }
        when {
            store.error.isNotEmpty() -> Hint(store.error, true)
            !store.membersLoaded -> Hint("Cargando…")
            sorted.isEmpty() -> Hint("Todavía no hay mánagers en esta liga.")
            else -> LazyColumn(
                contentPadding = PaddingValues(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                itemsIndexed(sorted, key = { _, m -> m.uid }) { i, m ->
                    val mine = m.uid == me
                    val shape = RoundedCornerShape(16.dp)
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable { onOpenTeam(m.uid) }
                            .background(Surface1, shape)
                            .border(if (mine) 2.dp else 1.dp, if (mine) Hot else Line, shape)
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            (i + 1).toString(),
                            modifier = Modifier.width(30.dp),
                            color = if (i == 0) Gold else Muted,
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp,
                            fontStyle = FontStyle.Italic
                        )
                        Avatar(m.name, 42, i == 0)
                        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                            Text(
                                m.name + if (mine) "  (tú)" else "",
                                color = Fg, fontWeight = FontWeight.SemiBold, fontSize = 16.sp,
                                maxLines = 1, overflow = TextOverflow.Ellipsis
                            )
                            val sub = when (mode) {
                                0 -> "Jornada: " + m.j + " pts"
                                1 -> "Total: " + m.tot + " pts"
                                else -> "Caja: " + eur(m.cash)
                            }
                            Text(sub, color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        val big = when (mode) {
                            0 -> m.tot.toString() + " pts"
                            1 -> m.j.toString() + " pts"
                            else -> eur(m.value)
                        }
                        Text(big, color = if (mine) Hot else Fg, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = if (mode == 2) 15.sp else 20.sp)
                    }
                }
            }
        }
    }
}
