package com.jbfer.entregador

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.jbfer.entregador.data.api.SessionManager
import com.jbfer.entregador.utils.openHome
import com.jbfer.entregador.utils.openLogin

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Roteamento: se já logado vai para Home, senão para Login
        if (SessionManager.isLoggedIn()) {
            openHome(this)
        } else {
            openLogin(this)
        }
        finish()
    }
}