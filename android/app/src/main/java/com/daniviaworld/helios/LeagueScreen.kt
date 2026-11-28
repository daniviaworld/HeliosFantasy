package com.daniviaworld.helios

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.delay

@Composable
fun LeagueScreen(user: FirebaseUser, league: League, onBack: () -> Unit) {
    val store = remember(league.id) { LeagueStore(league.id, user.uid) }
    DisposableEffect(store) {
        store.start()
        onDispose { store.stop() }
    }
    LaunchedEffect(Unit) {
        Catalog.load()
        while (true) {
            delay(120000)
            Catalog.refreshPts()
        }
    }
    BackHandler(true) { onBack() }

    var tab by remember { mutableStateOf(0) }
    var viewUid by remember { mutableStateOf(user.uid) }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().background(Surface2).padding(horizontal = 8.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "‹", color = Accent, fontSize = 30.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable { onBack() }.padding(horizontal = 14.dp)
            )
            Column(Modifier.weight(1f)) {
                Text("HELIOS", color = Accent, fontSize = 20.sp, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic)
                Text(league.name, color = Muted, fontSize = 12.sp, maxLines = 1)
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (tab) {
                0 -> StandingsScreen(store, user.uid) { uid -> viewUid = uid; tab = 1 }
                1 -> TeamScreen(store, viewUid, user.uid) { uid -> viewUid = uid }
                2 -> MarketScreen(store, user.uid)
                else -> ActivityScreen(store)
            }
        }
        Row(Modifier.fillMaxWidth().background(Surface2).padding(vertical = 6.dp)) {
            TabButton("🏆", "Clasificación", tab == 0, Modifier.weight(1f)) { tab = 0 }
            TabButton("⚽", "Equipo", tab == 1, Modifier.weight(1f)) { viewUid = user.uid; tab = 1 }
            TabButton("🔁", "Mercado", tab == 2, Modifier.weight(1f)) { tab = 2 }
            TabButton("📋", "Actividad", tab == 3, Modifier.weight(1f)) { tab = 3 }
        }
    }
}

@Composable
fun TabButton(icon: String, label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Column(
        modifier.clickable { onClick() }.padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(icon, fontSize = 20.sp)
        Text(label, fontSize = 11.sp, color = if (selected) Hot else Muted, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal, maxLines = 1)
    }
}
