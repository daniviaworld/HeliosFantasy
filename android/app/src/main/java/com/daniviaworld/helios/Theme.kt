package com.daniviaworld.helios

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Bg = Color(0xFF0B1530)
val Surface1 = Color(0xFF101C3E)
val Surface2 = Color(0xFF16275A)
val Line = Color(0xFF243459)
val Muted = Color(0xFF93A1C0)
val Fg = Color(0xFFE9EFFB)
val Accent = Color(0xFFF5A623)
val Hot = Color(0xFFFF5A4F)
val Bad = Color(0xFFFF7A66)

@Composable
fun HeliosTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Accent,
            onPrimary = Color(0xFF1A0F08),
            background = Bg,
            onBackground = Fg,
            surface = Surface1,
            onSurface = Fg,
            secondary = Hot,
        ),
        content = content
    )
}
