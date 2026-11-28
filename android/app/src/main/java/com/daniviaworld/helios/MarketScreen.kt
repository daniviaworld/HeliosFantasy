package com.daniviaworld.helios

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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

@Composable
fun MarketScreen(store: LeagueStore, me: String) {
    if (!Catalog.loaded) {
        Hint(if (Catalog.error.isNotEmpty()) Catalog.error else "Cargando jugadores de LaLiga…", Catalog.error.isNotEmpty())
        return
    }
    val mk = store.market
    if (mk == null) {
        Hint(if (store.marketLoaded) "El mercado de esta liga todavía no está abierto. Lo abre el administrador desde la web." else "Cargando…")
        return
    }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            now = System.currentTimeMillis()
        }
    }
    var tab by remember { mutableStateOf(0) }
    var dlg by remember { mutableStateOf<Pl?>(null) }
    var toast by remember { mutableStateOf("") }

    val mine = store.members.firstOrNull { it.uid == me }
    val cash = mine?.cash ?: 0.0
    val bids: Map<Long, Double> = if (store.myBidsRound == mk.round) store.myBids else emptyMap()
    val committed = bids.values.sum()
    val left = mk.end - now
    val clock = if (left <= 0) "Cerrando…" else {
        val s = left / 1000
        String.format("%02d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
    }
    fun valueOf(p: Pl): Double = mk.values[p.a] ?: p.v

    Column(Modifier.fillMaxSize()) {
        Title("Mercado de fichajes")
        Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip("Mercado", tab == 0, Modifier.weight(1f)) { tab = 0 }
            Chip("Mis pujas (" + bids.size + ")", tab == 1, Modifier.weight(1f)) { tab = 1 }
        }
        Column(Modifier.padding(horizontal = 18.dp, vertical = 10.dp)) {
            Panel {
                Text("El mercado cierra en", color = Muted, fontSize = 12.sp)
                Text(clock, color = Fg, fontSize = 34.sp, fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic)
                Text("Pujas a ciegas: gana la más alta al cierre. Caja: " + eur(cash) + " · comprometido: " + eur(committed), color = Muted, fontSize = 12.sp)
            }
        }
        if (toast.isNotEmpty()) Text(toast, color = Gold, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 18.dp, vertical = 2.dp))

        val rows: List<Pl> = if (tab == 0) mk.listings.mapNotNull { Catalog.players[it] }
        else bids.keys.mapNotNull { Catalog.players[it] }
        if (rows.isEmpty()) {
            Hint(if (tab == 0) "No hay jugadores en el mercado ahora mismo." else "Todavía no has pujado por nadie.")
        } else {
            LazyColumn(
                Modifier.weight(1f),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 18.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(rows, key = { it.a }) { p ->
                    val bid = bids[p.a]
                    Row(
                        Modifier.fillMaxWidth()
                            .background(Surface1.copy(alpha = 0.85f), RoundedCornerShape(20.dp))
                            .border(if (bid != null) 2.dp else 1.dp, if (bid != null) Hot else Line, RoundedCornerShape(20.dp))
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        PlayerArt(p, Modifier.size(84.dp, 104.dp).clip(RoundedCornerShape(12.dp)).border(2.dp, tierColor(p.v), RoundedCornerShape(12.dp)))
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                PosChip(p.p)
                                Text(
                                    p.n, fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 24.sp,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)
                                )
                                Text("PTS", color = Muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                Text((Catalog.pts[p.a] ?: 0).toString(), fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 26.sp)
                            }
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Crest(p.t, 18.dp)
                                Text(Catalog.teamName(p.t), color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                Text("Valor", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Text(eur(valueOf(p)), fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 22.sp, color = Hot)
                            }
                            if (bid != null) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                    Text("Tu puja", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    Text(eur(bid), fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 22.sp)
                                }
                            } else {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                    Text("Puja mínima", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                    Text(eur(valueOf(p)), fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 22.sp)
                                }
                            }
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                                Text("LaLiga · " + clock, color = Muted, fontSize = 12.sp)
                                Box(
                                    Modifier.clip(RoundedCornerShape(14.dp)).background(BrandBrush).clickable { dlg = p; toast = "" }
                                        .padding(horizontal = 18.dp, vertical = 10.dp)
                                ) {
                                    Text(if (bid != null) "Cambiar" else "Pujar", color = Color(0xFF1B0404), fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                                }
                            }
                        }
                    }
                }
                item { Box(Modifier.height(8.dp)) }
            }
        }
    }

    val d = dlg
    if (d != null) {
        val minBid = valueOf(d)
        val cur = bids[d.a]
        var txt by remember(d.a) { mutableStateOf(trimNum(cur ?: minBid)) }
        var err by remember(d.a) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { dlg = null },
            title = { Text(d.n) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Puja mínima: " + eur(minBid) + ". Escribe la cantidad en millones (ej. 52,5).", fontSize = 13.sp)
                    OutlinedTextField(
                        value = txt,
                        onValueChange = { txt = it },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        label = { Text("Millones €") }
                    )
                    if (err.isNotEmpty()) Text(err, color = Bad, fontSize = 13.sp)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val amt = txt.replace(',', '.').toDoubleOrNull()
                    val others = committed - (cur ?: 0.0)
                    if (amt == null) {
                        err = "Escribe un número válido."
                    } else if (amt < minBid) {
                        err = "La puja mínima es " + eur(minBid) + "."
                    } else if (others + amt > cash + 0.0001) {
                        err = "No te llega la caja: te quedan " + eur(cash - others) + " para esta puja."
                    } else {
                        val nb = HashMap<Long, Double>(bids)
                        nb[d.a] = amt
                        store.saveBids(nb, mk.round) { e -> toast = e ?: "Puja guardada." }
                        dlg = null
                    }
                }) { Text("Guardar puja") }
            },
            dismissButton = {
                Row {
                    if (cur != null) {
                        TextButton(onClick = {
                            val nb = HashMap<Long, Double>(bids)
                            nb.remove(d.a)
                            store.saveBids(nb, mk.round) { e -> toast = e ?: "Puja retirada." }
                            dlg = null
                        }) { Text("Retirar", color = Bad) }
                    }
                    TextButton(onClick = { dlg = null }) { Text("Cancelar") }
                }
            }
        )
    }
}

fun trimNum(x: Double): String {
    val s = String.format(java.util.Locale.US, "%.2f", x)
    return s.trimEnd('0').trimEnd('.')
}
