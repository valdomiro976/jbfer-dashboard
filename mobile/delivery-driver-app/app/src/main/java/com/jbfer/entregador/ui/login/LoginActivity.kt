package com.jbfer.entregador.ui.login

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.lifecycleScope
import com.jbfer.entregador.databinding.ActivityLoginBinding
import com.jbfer.entregador.data.api.ApiClient
import com.jbfer.entregador.data.api.SessionManager
import com.jbfer.entregador.data.model.LoginRequest
import com.jbfer.entregador.utils.openHome
import com.jbfer.entregador.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LoginViewModel : ViewModel() {
    var loading = false
        private set

    suspend fun doLogin(cnpj: String, telefone: String, senha: String): String? {
        loading = true
        return try {
            val response = ApiClient.api.login(LoginRequest(cnpj, telefone, senha))
            if (response.sucesso) {
                val nome = response.entregador?.nome ?: ""
                SessionManager.save(response.accessToken, nome, response.cnpj ?: cnpj, telefone, senha)
                null
            } else {
                "Falha na autenticação"
            }
        } catch (e: Exception) {
            "Erro de conexão: ${e.message}"
        } finally {
            loading = false
        }
    }
}

class LoginActivity : ComponentActivity() {

    private lateinit var binding: ActivityLoginBinding
    private val viewModel: LoginViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Se já logado, vai direto para o home
        if (SessionManager.isLoggedIn()) {
            openHome(this)
            finish()
            return
        }

        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        SessionManager.getCnpj()?.let { binding.etCnpj.setText(it) }
        SessionManager.getTelefone()?.let { binding.etTelefone.setText(it) }
        SessionManager.getSenha()?.let { binding.etSenha.setText(it) }

        // Auto-login com credenciais salvas
        val savedCnpj = SessionManager.getCnpj()
        val savedTel = SessionManager.getTelefone()
        val savedSenha = SessionManager.getSenha()
        if (savedCnpj != null && savedTel != null && savedSenha != null && !SessionManager.isLoggedIn()) {
            binding.btnLogin.isEnabled = false
            binding.btnLogin.text = "Entrando..."
            lifecycleScope.launch {
                val erro = viewModel.doLogin(savedCnpj, savedTel, savedSenha)
                binding.btnLogin.isEnabled = true
                binding.btnLogin.text = getString(R.string.login)
                if (erro != null) {
                    // Credenciais salvas invalidas: limpa senha e pede ao usuario
                    SessionManager.clear()
                    binding.etSenha.setText("")
                    Toast.makeText(this@LoginActivity, "Sessão expirada. Digite a senha novamente.", Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(this@LoginActivity, "Bem-vindo, ${SessionManager.getNome()}!", Toast.LENGTH_SHORT).show()
                    openHome(this@LoginActivity)
                    finish()
                }
            }
        }

        binding.btnLogin.setOnClickListener {
            val cnpj = binding.etCnpj.text.toString().trim()
            val telefone = binding.etTelefone.text.toString().trim()
            val senha = binding.etSenha.text.toString()

            if (cnpj.isEmpty() || telefone.isEmpty() || senha.isEmpty()) {
                Toast.makeText(this, "Preencha todos os campos", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            binding.btnLogin.isEnabled = false
            binding.btnLogin.text = "Entrando..."

            lifecycleScope.launch {
                val erro = viewModel.doLogin(cnpj, telefone, senha)
                binding.btnLogin.isEnabled = true
                binding.btnLogin.text = getString(R.string.login)
                if (erro != null) {
                    Toast.makeText(this@LoginActivity, erro, Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(this@LoginActivity, "Bem-vindo, ${SessionManager.getNome()}!", Toast.LENGTH_SHORT).show()
                    openHome(this@LoginActivity)
                    finish()
                }
            }
        }
    }
}