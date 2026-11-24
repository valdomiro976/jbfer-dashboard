package com.jbfer.entregador

import android.app.Application
import org.osmdroid.config.Configuration

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        // Configuração do OSMdroid (OpenStreetMap)
        instance = this
        Configuration.getInstance().load(this, android.preference.PreferenceManager.getDefaultSharedPreferences(this))
    }

    companion object {
        lateinit var instance: App
            private set
    }
}