package com.daniviaworld.helios

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.google.firebase.auth.FirebaseAuth

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            HeliosTheme { Root() }
        }
    }
}

@Composable
fun Root() {
    val auth = remember { FirebaseAuth.getInstance() }
    var user by remember { mutableStateOf(auth.currentUser) }
    var open by remember { mutableStateOf<League?>(null) }
    DisposableEffect(Unit) {
        val l = FirebaseAuth.AuthStateListener { user = it.currentUser }
        auth.addAuthStateListener(l)
        onDispose { auth.removeAuthStateListener(l) }
    }
    Box(Modifier.fillMaxSize().background(Bg)) {
        val u = user
        val o = open
        if (u == null) {
            LoginScreen(auth)
        } else if (o == null) {
            LeaguesScreen(u, auth) { open = it }
        } else {
            LeagueScreen(u, o) { open = null }
        }
    }
}
