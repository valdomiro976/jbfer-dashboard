package com.jbfer.entregador.helpers

import android.content.Context
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.jbfer.entregador.R

fun showToast(context: Context, message: String) {
    Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
}

fun statusColor(context: Context, status: String?): Int {
    return when (status) {
        "entregue" -> ContextCompat.getColor(context, R.color.success)
        "cancelada" -> ContextCompat.getColor(context, R.color.danger)
        "em_transito", "aceita" -> ContextCompat.getColor(context, R.color.accent)
        else -> ContextCompat.getColor(context, R.color.warning)
    }
}