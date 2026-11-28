package com.daniviaworld.helios

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.FirebaseFirestore

data class League(val id: String, val name: String, val code: String, val managers: Int, val admin: String)

@Composable
fun LeaguesScreen(user: FirebaseUser, auth: FirebaseAuth, onOpen: (League) -> Unit) {
    var leagues by remember { mutableStateOf<List<League>?>(null) }
    var err by remember { mutableStateOf("") }

    DisposableEffect(user.uid) {
        val reg = FirebaseFirestore.getInstance().collection("leagues")
            .whereArrayContains("memberUids", user.uid)
            .addSnapshotListener { snap, e ->
                if (e != null) {
                    err = "No se pudieron cargar tus ligas."
                    return@addSnapshotListener
                }
                err = ""
                leagues = snap?.documents?.map { d ->
                    League(
                        id = d.id,
                        name = d.getString("name") ?: "Liga",
                        code = d.getString("code") ?: "",
                        managers = (d.get("memberUids") as? List<*>)?.size ?: 0,
                        admin = d.getString("adminName") ?: ""
                    )
                } ?: emptyList()
            }
        onDispose { reg.remove() }
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().background(Surface2).padding(horizontal = 18.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text("HELIOS", fontSize = 26.sp, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, color = Accent)
                Text(user.displayName ?: user.email ?: "", color = Muted, fontSize = 13.sp)
            }
            TextButton(onClick = { auth.signOut() }) { Text("Salir", color = Muted) }
        }
        Column(Modifier.padding(18.dp)) {
            Text("MIS LIGAS", fontSize = 30.sp, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, color = Fg)
        }
        val list = leagues
        when {
            err.isNotEmpty() -> Text(err, color = Bad, modifier = Modifier.padding(18.dp))
            list == null -> Text("Cargando…", color = Muted, modifier = Modifier.padding(18.dp))
            list.isEmpty() -> Text("Todavía no estás en ninguna liga.", color = Muted, modifier = Modifier.padding(18.dp))
            else -> LazyColumn(
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 18.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(list, key = { it.id }) { l ->
                    Column(
                        Modifier.fillMaxWidth()
                            .clickable { onOpen(l) }
                            .background(Surface1, RoundedCornerShape(16.dp))
                            .border(1.dp, Line, RoundedCornerShape(16.dp))
                            .padding(16.dp)
                    ) {
                        Text(l.name, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Fg)
                        Text(
                            "${l.managers} mánagers" + (if (l.admin.isNotEmpty()) " · administra ${l.admin}" else ""),
                            color = Muted, fontSize = 14.sp
                        )
                    }
                }
            }
        }
    }
}
