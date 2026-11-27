package com.jbfer.entregador.ui.home

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.jbfer.entregador.databinding.ActivityHomeBinding
import com.jbfer.entregador.data.api.SessionManager
import com.jbfer.entregador.R
import com.jbfer.entregador.services.LocationTrackingService
import com.jbfer.entregador.ui.tasks.TasksFragment

class HomeActivity : AppCompatActivity() {

    private lateinit var binding: ActivityHomeBinding

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions.values.all { it }
        if (!granted) {
            Toast.makeText(this, R.string.permissao_localizacao, Toast.LENGTH_LONG).show()
        } else {
            LocationTrackingService.start(this)
            requestIgnoreBatteryOptimizations()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityHomeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Solicita permissões de localização (inclui segundo plano) e inicia o rastreamento
        requestLocationPermission()

        // Solicita permissão de notificação (Android 13+) separadamente
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
                    if (!granted) {
                        Toast.makeText(this, "Permissão de notificação negada. O rastreamento pode não funcionar.", Toast.LENGTH_LONG).show()
                    }
                }.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        // Se a permissão de localização em segundo plano não estiver concedida,
        // abre as configurações do app para o usuário conceder "Permitir o tempo todo"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                AlertDialog.Builder(this)
                    .setTitle("Permissão de localização")
                    .setMessage("Para o rastreamento funcionar em segundo plano, conceda a permissão de localização 'Permitir o tempo todo' nas configurações.")
                    .setPositiveButton("Abrir configurações") { _, _ ->
                        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                        startActivity(intent)
                    }
                    .setNegativeButton("Cancelar", null)
                    .show()
            }
        }
        binding.bottomNav.setOnClickListener {
            changeFragment(TasksFragment())
        }

        binding.btnFechar.setOnClickListener {
            // Apenas minimiza o app (nao desloga)
            moveTaskToBack(true)
        }

        // Logout agora é feito via menu 3 pontinhos na tela de entregas

        if (savedInstanceState == null) {
            changeFragment(TasksFragment())
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        MaterialAlertDialogBuilder(this)
            .setTitle("Sair")
            .setMessage("Deseja sair do app?")
            .setPositiveButton("Sair") { _, _ ->
                LocationTrackingService.stop(this)
                com.jbfer.entregador.data.api.SessionManager.clear()
                com.jbfer.entregador.utils.openLogin(this)
                finish()
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun changeFragment(fragment: Fragment) {
        supportFragmentManager.beginTransaction()
            .replace(com.jbfer.entregador.R.id.fragment_container, fragment)
            .commit()
    }

    private fun requestLocationPermission() {
        val permissions = buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            add(Manifest.permission.ACCESS_COARSE_LOCATION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        val todosConcedidos = permissions.all {
            ContextCompat.checkSelfPermission(this, it) == android.content.pm.PackageManager.PERMISSION_GRANTED
        }
        if (!todosConcedidos) {
            permissionLauncher.launch(permissions.toTypedArray())
        } else {
            LocationTrackingService.start(this)
            requestIgnoreBatteryOptimizations()
        }
    }

    private fun requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            try {
                startActivity(
                    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))
                )
            } catch (e: Exception) {
                // Em alguns fabricantes a tela de otimização não está disponível
            }
        }
    }
}