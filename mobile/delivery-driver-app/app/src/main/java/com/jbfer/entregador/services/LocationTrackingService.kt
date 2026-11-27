package com.jbfer.entregador.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.jbfer.entregador.R
import com.jbfer.entregador.data.api.ApiClient
import com.jbfer.entregador.data.api.SessionManager
import com.jbfer.entregador.data.model.LocalizacaoRequest
import com.jbfer.entregador.ui.home.HomeActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class LocationTrackingService : Service() {
    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private var wakeLock: PowerManager.WakeLock? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jbfer:rastreamento")
            .apply { acquire(8 * 60 * 60 * 1000L) }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        stopped = false
        if (!hasLocationPermission()) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, buildNotification())
        startTracking()
        return START_NOT_STICKY
    }

    private fun startTracking() {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 15000)
            .setMinUpdateIntervalMillis(5000)
            .build()

        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                val loc = locationResult.lastLocation ?: return
                enviarLocalizacao(loc.latitude, loc.longitude, loc.accuracy, loc.speed)
            }
        }
        fusedClient.requestLocationUpdates(request, locationCallback, android.os.Looper.getMainLooper())
    }

    private fun enviarLocalizacao(lat: Double, lng: Double, precisao: Float, velocidade: Float) {
        if (stopped || SessionManager.isLoggedOut() || !SessionManager.isLoggedIn()) {
            stopSelf()
            return
        }
        scope.launch {
            try {
                ApiClient.api.enviarLocalizacao(LocalizacaoRequest(lat, lng, precisao, velocidade))
            } catch (e: Exception) {
                // Continua mesmo com erro de rede
            }
        }
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.time_continuo),
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val intent = Intent(this, HomeActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.time_continuo))
            .setContentText(getString(R.string.time_continuo_desc))
            .setSmallIcon(R.drawable.ic_rastreamento)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::fusedClient.isInitialized && ::locationCallback.isInitialized) {
            try {
                fusedClient.removeLocationUpdates(locationCallback)
            } catch (e: Exception) {
                // Ignora
            }
        }
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        scope.cancel()
    }

    companion object {
        @Volatile var stopped = false
        const val CHANNEL_ID = "rastreamento_continuo"
        const val NOTIFICATION_ID = 101

        fun start(context: Context) {
            stopped = false
            val intent = Intent(context, LocationTrackingService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            stopped = true
            context.stopService(Intent(context, LocationTrackingService::class.java))
        }
    }
}