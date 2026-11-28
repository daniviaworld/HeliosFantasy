package com.daniviaworld.helios

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
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
    val mine = store.members.firstOrNull { it.uid == user.uid }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().background(Head).padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Image(
                painterResource(R.drawable.logo), contentDescription = "Mis ligas",
                modifier = Modifier.size(46.dp).clip(RoundedCornerShape(10.dp)).clickable { onBack() }
            )
            Column(Modifier.weight(1f).padding(start = 10.dp)) {
                Text("HELIOS", fontFamily = Display, fontWeight = FontWeight.ExtraBold, fontStyle = FontStyle.Italic, fontSize = 28.sp, lineHeight = 26.sp, color = Color.White)
                Text(league.name, color = HeadMuted, fontSize = 13.sp, maxLines = 1)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("SALDO", color = HeadMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Text(
                    eur(mine?.cash ?: 0.0), fontFamily = Display, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic,
                    fontSize = 26.sp, color = Color.White, maxLines = 1
                )
            }
        }
        Box(Modifier.fillMaxWidth().height(3.dp).background(BrandBrush))
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (tab) {
                0 -> StandingsScreen(store, user.uid) { uid -> viewUid = uid; tab = 1 }
                1 -> TeamScreen(store, viewUid, user.uid) { uid -> viewUid = uid }
                2 -> MarketScreen(store, user.uid)
                else -> ActivityScreen(store)
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp)
                .background(Surface1, RoundedCornerShape(30.dp))
                .border(1.dp, Line, RoundedCornerShape(30.dp))
                .padding(6.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            NavItem(0, "Mis ligas", false, Modifier.weight(1f)) { onBack() }
            NavItem(1, "Clasificación", tab == 0, Modifier.weight(1f)) { tab = 0 }
            NavItem(2, "Equipo", tab == 1, Modifier.weight(1f)) { viewUid = user.uid; tab = 1 }
            NavItem(3, "Mercado", tab == 2, Modifier.weight(1f)) { tab = 2 }
            NavItem(4, "Actividad", tab == 3, Modifier.weight(1f)) { tab = 3 }
        }
    }
}

@Composable
fun NavItem(kind: Int, label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(22.dp)
    val ink = if (selected) Color(0xFF1B0404) else Fg
    Column(
        modifier.clip(shape).clickable { onClick() }
            .then(if (selected) Modifier.background(BrandBrush, shape) else Modifier)
            .padding(vertical = 7.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        NavIcon(kind, ink)
        Text(label, fontSize = 10.sp, color = ink, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}
