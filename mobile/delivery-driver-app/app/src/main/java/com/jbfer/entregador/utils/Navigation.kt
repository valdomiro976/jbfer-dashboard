package com.jbfer.entregador.utils

import android.content.Context
import android.content.Intent
import com.jbfer.entregador.ui.home.HomeActivity
import com.jbfer.entregador.ui.login.LoginActivity

fun openHome(context: Context) {
    context.startActivity(Intent(context, HomeActivity::class.java))
}

fun openLogin(context: Context) {
    context.startActivity(Intent(context, LoginActivity::class.java))
}