package com.daniviaworld.helios

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun ActivityScreen(store: LeagueStore) {
    Column(Modifier.fillMaxSize()) {
        Title("Actividad", "Fichajes, ofertas y novedades de la liga")
        if (store.news.isEmpty()) {
            Hint("Todavía no hay actividad en esta liga.")
        } else {
            LazyColumn(
                contentPadding = PaddingValues(18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(store.news, key = { it.id }) { n ->
                    Column(
                        Modifier.fillMaxWidth()
                            .background(Surface1, RoundedCornerShape(14.dp))
                            .border(1.dp, Line, RoundedCornerShape(14.dp))
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(fmtDate(n.ts) + " · " + kindLabel(n.kind), color = Muted, fontSize = 11.sp)
                        Text(n.text, color = Fg, fontSize = 15.sp)
                    }
                }
            }
        }
    }
}

fun kindLabel(k: String): String = when (k) {
    "fichaje" -> "Fichaje"
    "mercado" -> "Mercado"
    "clausulazo" -> "Clausulazo"
    "oferta" -> "Oferta"
    "admin" -> "Administrador"
    "jornada" -> "Jornada"
    else -> "Novedad"
}
