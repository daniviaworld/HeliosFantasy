package com.daniviaworld.helios

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight

// Mismos colores que la web (tema oscuro por defecto)
val Bg = Color(0xFF0A1226)
val Surface1 = Color(0xFF121D38)
val Surface2 = Color(0xFF1B2A52)
val Line = Color(0xFF243459)
val Muted = Color(0xFF93A1C0)
val Fg = Color(0xFFE9EFFB)
val Accent = Color(0xFFF5A524)
val Hot = Color(0xFFFF5A52)
val Bad = Color(0xFFF27A70)
val Head = Color(0xFF0C1630)
val HeadMuted = Color(0xFF8FA0C4)

val Display = FontFamily(
    Font(R.font.cond_700_italic, FontWeight.Bold, FontStyle.Italic),
    Font(R.font.cond_800_italic, FontWeight.ExtraBold, FontStyle.Italic),
    Font(R.font.cond_700_italic, FontWeight.Normal, FontStyle.Normal),
    Font(R.font.cond_800_italic, FontWeight.SemiBold, FontStyle.Normal)
)
val Body = FontFamily(
    Font(R.font.body_400, FontWeight.Normal),
    Font(R.font.body_500, FontWeight.Medium),
    Font(R.font.body_600, FontWeight.SemiBold),
    Font(R.font.body_700, FontWeight.Bold)
)

val BrandBrush = Brush.horizontalGradient(listOf(Color(0xFFF5A524), Color(0xFFFF5A52)))

@Composable
fun HeliosTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Accent,
            onPrimary = Color(0xFF1B1204),
            background = Bg,
            onBackground = Fg,
            surface = Surface1,
            onSurface = Fg,
            secondary = Hot,
        )
    ) {
        ProvideTextStyle(TextStyle(fontFamily = Body, color = Fg)) { content() }
    }
}
