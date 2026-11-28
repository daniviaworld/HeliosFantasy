package com.daniviaworld.helios

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class HeliosApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Mismo proyecto de Firebase que la web: no hace falta google-services.json
        val opts = FirebaseOptions.Builder()
            .setApiKey("AIzaSyA8koB-8DY808Ofgvtt-qeZsZTyMP9YZkU")
            .setApplicationId("1:772881340683:web:322cdd5a270d107741ea0e")
            .setProjectId("helios-fantasy")
            .setStorageBucket("helios-fantasy.firebasestorage.app")
            .setGcmSenderId("772881340683")
            .build()
        if (FirebaseApp.getApps(this).isEmpty()) FirebaseApp.initializeApp(this, opts)
    }
}
