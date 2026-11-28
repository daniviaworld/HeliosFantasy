package com.daniviaworld.helios

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.userProfileChangeRequest

private fun authMsg(e: Exception?): String {
    if (e is FirebaseNetworkException) return "Sin conexión. Revisa tu internet."
    val code = (e as? FirebaseAuthException)?.errorCode ?: ""
    return when (code) {
        "ERROR_INVALID_CREDENTIAL", "ERROR_WRONG_PASSWORD", "ERROR_USER_NOT_FOUND" -> "Correo o contraseña incorrectos."
        "ERROR_EMAIL_ALREADY_IN_USE" -> "Ese correo ya tiene cuenta. Prueba a entrar."
        "ERROR_WEAK_PASSWORD" -> "La contraseña es muy corta (mínimo 6 caracteres)."
        "ERROR_INVALID_EMAIL" -> "El correo no es válido."
        "ERROR_TOO_MANY_REQUESTS" -> "Demasiados intentos. Espera unos minutos."
        else -> "No se pudo entrar" + (if (code.isNotEmpty()) " ($code)" else "") + "."
    }
}

@Composable
fun LoginScreen(auth: FirebaseAuth) {
    var mail by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var register by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("HELIOS", fontSize = 48.sp, fontWeight = FontWeight.Bold, fontStyle = FontStyle.Italic, color = Accent)
        Text("Fantasy DWT", color = Muted)
        Spacer(Modifier.height(28.dp))
        if (register) {
            OutlinedTextField(
                value = name, onValueChange = { name = it }, label = { Text("Nombre de mánager") },
                singleLine = true, modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(10.dp))
        }
        OutlinedTextField(
            value = mail, onValueChange = { mail = it }, label = { Text("Correo") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = pass, onValueChange = { pass = it }, label = { Text("Contraseña") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth()
        )
        if (err.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Text(err, color = Bad)
        }
        Spacer(Modifier.height(18.dp))
        Button(
            enabled = !busy && mail.isNotBlank() && pass.isNotEmpty() && (!register || name.isNotBlank()),
            modifier = Modifier.fillMaxWidth().height(50.dp),
            onClick = {
                busy = true; err = ""
                val m = mail.trim().lowercase()
                val task = if (register) auth.createUserWithEmailAndPassword(m, pass) else auth.signInWithEmailAndPassword(m, pass)
                task.addOnCompleteListener { t ->
                    busy = false
                    if (!t.isSuccessful) err = authMsg(t.exception)
                    else if (register) {
                        t.result?.user?.updateProfile(userProfileChangeRequest { displayName = name.trim() })
                    }
                }
            }
        ) { Text(if (register) "Crear cuenta" else "Entrar", fontWeight = FontWeight.Bold) }
        TextButton(onClick = { register = !register; err = "" }, modifier = Modifier.fillMaxWidth()) {
            Text(if (register) "Ya tengo cuenta" else "Crear una cuenta nueva", color = Muted)
        }
    }
}
