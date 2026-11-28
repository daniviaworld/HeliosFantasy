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
                Text(clock, color = Fg, fontSize = 28.sp, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic)
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
                            .background(Surface1, RoundedCornerShape(16.dp))
                            .border(1.dp, if (bid != null) Hot else Line, RoundedCornerShape(16.dp))
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                PosChip(p.p)
                                Text(
                                    "  " + p.n, color = Fg, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, fontSize = 17.sp,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis
                                )
                            }
                            Text(Catalog.teamName(p.t) + " · " + (Catalog.pts[p.a] ?: 0) + " pts", color = Muted, fontSize = 12.sp)
                            Text("Valor " + eur(valueOf(p)), color = Fg, fontSize = 13.sp)
                            if (bid != null) Text("Tu puja: " + eur(bid), color = Hot, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                        Button(onClick = { dlg = p; toast = "" }) { Text(if (bid != null) "Cambiar" else "Pujar") }
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
