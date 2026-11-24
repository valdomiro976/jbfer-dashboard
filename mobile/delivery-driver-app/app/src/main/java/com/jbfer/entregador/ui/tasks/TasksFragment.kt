package com.jbfer.entregador.ui.tasks

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.Tasks
import com.jbfer.entregador.R
import com.jbfer.entregador.helpers.showToast
import com.jbfer.entregador.helpers.statusColor
import com.jbfer.entregador.data.api.ApiClient
import com.jbfer.entregador.data.model.AtualizarRequest
import com.jbfer.entregador.data.model.CoordenadasClienteRequest
import com.jbfer.entregador.data.model.Tarefa
import com.jbfer.entregador.databinding.FragmentTasksBinding
import com.jbfer.entregador.databinding.ItemTarefaBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.PI

class TasksFragment : Fragment() {

    private var _binding: FragmentTasksBinding? = null
    private val binding get() = _binding!!
    private val tarefas = mutableListOf<Tarefa>()
    private val hiddenIds = mutableSetOf<Int>()
    private lateinit var adapter: TarefasAdapter

    companion object {
        private const val LIMITE_DIVERGENCIA_M = 100.0
        private const val REQUEST_LOCATION = 101
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentTasksBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        adapter = TarefasAdapter(requireContext(), tarefas, hiddenIds) { tarefa, itemView ->
            showActionsDialog(tarefa, itemView)
        }
        binding.recyclerTasks.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerTasks.adapter = adapter

        binding.btnRefresh.setOnClickListener { loadTasks() }
        loadTasks()
    }

    private fun loadTasks() {
        binding.progress.visibility = View.VISIBLE
        binding.tvEmpty.isVisible = false
        lifecycleScope.launch {
            try {
                val response = withContext(Dispatchers.IO) { ApiClient.api.minhasTarefas() }
                tarefas.clear()
                tarefas.addAll(response.tarefas.orEmpty())
                adapter.notifyDataSetChanged()
                binding.tvEmpty.isVisible = tarefas.isEmpty()
            } catch (e: Exception) {
                binding.tvEmpty.visibility = View.VISIBLE
                binding.tvEmpty.text = "Erro: ${e.message}"
            } finally {
                binding.progress.visibility = View.INVISIBLE
            }
        }
    }

    private fun detalhesTarefa(tarefa: Tarefa): String {
        val sb = StringBuilder()
        val itens = tarefa.itens ?: tarefa.pedidoDescricao
        if (!itens.isNullOrBlank()) {
            val qtd = tarefa.quantidade ?: 1
            sb.append("Produto(s): ").append(itens).append(" — ").append(qtd).append(" ${if (qtd == 1) "item" else "itens"}").append("\n")
        }
        tarefa.pagamento?.takeIf { it.isNotBlank() }?.let {
            sb.append("Pagamento: ").append(it).append("\n")
        }
        tarefa.valorTotal?.let {
            sb.append("Valor: R$ ").append("%.2f".format(it)).append("\n")
        }
        val endereco = listOfNotNull(tarefa.clienteEndereco, tarefa.clienteCidade, tarefa.clienteUf, tarefa.clienteCep)
            .joinToString(", ").trim()
        if (endereco.isNotEmpty()) {
            sb.append("Endereço: ").append(endereco).append("\n")
        }
        return sb.toString().trimEnd('\n')
    }

    private fun showActionsDialog(tarefa: Tarefa, clickedView: View? = null) {
        val status = tarefa.status ?: ""
        val view = layoutInflater.inflate(R.layout.dialog_tarefa_acoes, null)
        clickedView?.visibility = View.GONE
        hiddenIds.add(tarefa.id)
        adapter.notifyDataSetChanged()
        view.post { view.scrollTo(0, 0) }

        view.findViewById<TextView>(R.id.tvDialogNumero).text = "Entrega #${tarefa.id}"
        val tvStatus = view.findViewById<TextView>(R.id.tvDialogStatus)
        tvStatus.text = status.replace('_', ' ').uppercase()
        tvStatus.setTextColor(
            when (status) {
                "pendente" -> resources.getColor(R.color.warning, null)
                "aceita" -> resources.getColor(R.color.primary_light, null)
                "em_transito" -> resources.getColor(R.color.accent, null)
                "entregue" -> resources.getColor(R.color.success, null)
                "cancelada" -> resources.getColor(R.color.danger, null)
                else -> resources.getColor(R.color.text_secondary, null)
            }
        )
        view.findViewById<TextView>(R.id.tvDialogCliente).text = tarefa.clienteNome ?: "Cliente"
        view.findViewById<TextView>(R.id.tvDialogProduto).text = detalhesTarefa(tarefa)
        view.findViewById<TextView>(R.id.tvDialogPagamento).text = tarefa.pagamento?.let { "Pagamento: $it" } ?: ""
        view.findViewById<TextView>(R.id.tvDialogValor).text = "R$ %.2f".format(tarefa.valorTotal ?: 0.0)
        val endereco = listOfNotNull(tarefa.clienteEndereco, tarefa.clienteCidade, tarefa.clienteUf, tarefa.clienteCep)
            .joinToString(", ").trim()
        view.findViewById<TextView>(R.id.tvDialogEndereco).text = if (endereco.isNotEmpty()) "📍 $endereco" else ""

        val btnIniciar = view.findViewById<com.google.android.material.button.MaterialButton>(R.id.btnIniciar)
        val btnConcluir = view.findViewById<com.google.android.material.button.MaterialButton>(R.id.btnConcluir)
        val btnSalvarLocal = view.findViewById<com.google.android.material.button.MaterialButton>(R.id.btnSalvarLocal)
        val btnNavegar = view.findViewById<com.google.android.material.button.MaterialButton>(R.id.btnNavegar)
        val btnCancelar = view.findViewById<com.google.android.material.button.MaterialButton>(R.id.btnCancelar)

        btnIniciar.visibility = View.VISIBLE
        btnConcluir.visibility = View.VISIBLE
        if (status != "entregue" && status != "cancelada") {
            btnCancelar.visibility = View.VISIBLE
        }

        btnIniciar.setOnClickListener {
            confirmarAcao("Marcar em rota de entrega #${tarefa.id}?") {
                val chip = view.findViewById<TextView>(R.id.tvDialogStatus)
                chip.text = "EM TRANSITO"
                chip.setTextColor(resources.getColor(R.color.accent, null))
                atualizarStatus(tarefa, "em_transito")
            }
        }
        btnConcluir.setOnClickListener {
            confirmarAcao("Marcar entrega #${tarefa.id} como entregue?") {
                val chip = view.findViewById<TextView>(R.id.tvDialogStatus)
                chip.text = "ENTREGUE"
                chip.setTextColor(resources.getColor(R.color.success, null))
                concluirEntrega(tarefa)
            }
        }
        btnSalvarLocal.setOnClickListener { salvarLocalizacaoCliente(tarefa) }
        btnNavegar.setOnClickListener { navegarParaCliente(tarefa) }
        btnCancelar.setOnClickListener {
            confirmarAcao("Voltar esta entrega para pendente?") {
                val chip = view.findViewById<TextView>(R.id.tvDialogStatus)
                chip.text = "PENDENTE"
                chip.setTextColor(resources.getColor(R.color.warning, null))
                atualizarStatus(tarefa, "pendente")
            }
        }

        val dialog = MaterialAlertDialogBuilder(requireContext())
            .setView(view)
            .create()
        dialog.setOnDismissListener {
            hiddenIds.remove(tarefa.id)
            adapter.notifyDataSetChanged()
            clickedView?.visibility = View.VISIBLE
        }
        dialog.window?.setDimAmount(1.0f)
        dialog.window?.setBackgroundDrawableResource(R.color.background)
        dialog.window?.setLayout(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.MATCH_PARENT)
        dialog.show()
    }

    private fun navegarParaCliente(tarefa: Tarefa) {
        val endereco = listOfNotNull(tarefa.clienteEndereco, tarefa.clienteCidade, tarefa.clienteUf, tarefa.clienteCep)
            .joinToString(", ")
            .trim()
        val query = if (tarefa.clienteLat != null && tarefa.clienteLng != null) {
            "${tarefa.clienteLat},${tarefa.clienteLng}"
        } else {
            endereco.ifEmpty { "${tarefa.clienteNome ?: "Cliente"}" }
        }
        try {
            val uri = Uri.parse("geo:0,0?q=" + Uri.encode(query))
            val intent = Intent(Intent.ACTION_VIEW, uri).setPackage("com.google.android.apps.maps")
            startActivity(intent)
        } catch (e: Exception) {
            showToast(requireContext(), "Google Maps não disponível")
        }
    }

    private fun concluirEntrega(tarefa: Tarefa) {
        // "Concluir" usa a posição atual do GPS para verificar divergência com o cadastro
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                REQUEST_LOCATION
            )
            return
        }

        lifecycleScope.launch {
            val loc = try {
                withContext(Dispatchers.IO) {
                    val client = LocationServices.getFusedLocationProviderClient(requireContext())
                    Tasks.await(client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null))
                }
            } catch (e: Exception) {
                null
            }

            val cadLat = tarefa.clienteLat
            val cadLng = tarefa.clienteLng

            // Sem coordenadas cadastradas do cliente: conclui direto
            if (cadLat == null || cadLng == null || loc == null) {
                atualizarStatus(tarefa, "entregue")
                return@launch
            }

            val distancia = distanciaMetros(loc.latitude, loc.longitude, cadLat, cadLng)
            if (distancia <= LIMITE_DIVERGENCIA_M) {
                atualizarStatus(tarefa, "entregue")
                return@launch
            }

            // Divergência: pergunta se deseja atualizar a localização do cliente
            MaterialAlertDialogBuilder(requireContext())
                .setTitle("Localização diferente do cadastro")
                .setMessage(
                    "A sua localização atual está a %.0f metros do endereço cadastrado do cliente.\n\n" +
                        "Deseja atualizar a localização do cliente no cadastro?".format(distancia)
                )
                .setPositiveButton("Sim, atualizar") { _, _ ->
                    algoDivergente(tarefa, loc.latitude, loc.longitude)
                }
                .setNegativeButton("Não") { _, _ ->
                    atualizarStatus(tarefa, "entregue")
                }
                .show()
        }
    }

    private fun algoDivergente(tarefa: Tarefa, lat: Double, lng: Double) {
        // Atualiza o cadastro do cliente com a localização atual e conclui a entrega
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    ApiClient.api.atualizarCoordenadasCliente(tarefa.id, CoordenadasClienteRequest(lat, lng))
                }
                atualizarStatus(tarefa, "entregue")
            } catch (e: Exception) {
                showToast(requireContext(), "Erro ao atualizar: ${e.message}")
            }
        }
    }

    private fun atualizarStatus(tarefa: Tarefa, status: String, motivo: String? = null, onSuccess: (() -> Unit)? = null) {
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    ApiClient.api.atualizarTarefa(tarefa.id, AtualizarRequest(status, motivo))
                }
                onSuccess?.invoke()
                loadTasks()
            } catch (e: Exception) {
                showToast(requireContext(), "Erro: ${e.message}")
            }
        }
    }

    private fun confirmarAcao(mensagem: String, onConfirm: () -> Unit) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Confirmar")
            .setMessage(mensagem)
            .setPositiveButton("Sim") { _, _ -> onConfirm() }
            .setNegativeButton("Não", null)
            .show()
    }

    private fun confirmarCancelamento(tarefa: Tarefa) {
        val input = EditText(requireContext()).apply {
            hint = "Informe o motivo do cancelamento"
            isSingleLine = false
        }
        val padding = (16 * resources.displayMetrics.density).toInt()
        input.setPadding(padding, padding / 2, padding, padding / 2)

        MaterialAlertDialogBuilder(requireContext())
            .setTitle("Cancelar entrega")
            .setMessage("Tem certeza que deseja cancelar a entrega #${tarefa.id}?")
            .setView(input)
            .setPositiveButton("Sim, cancelar") { _, _ ->
                val motivo = input.text.toString().trim()
                if (motivo.isEmpty()) {
                    showToast(requireContext(), "Informe o motivo do cancelamento")
                    confirmarCancelamento(tarefa)
                } else {
                    atualizarStatus(tarefa, "cancelada", motivo)
                }
            }
            .setNegativeButton("Voltar", null)
            .show()
    }

    private fun salvarLocalizacaoCliente(tarefa: Tarefa) {
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                REQUEST_LOCATION
            )
            return
        }

        lifecycleScope.launch {
            val loc = try {
                withContext(Dispatchers.IO) {
                    val client = LocationServices.getFusedLocationProviderClient(requireContext())
                    Tasks.await(client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null))
                }
            } catch (e: Exception) {
                null
            }

            if (loc == null) {
                showToast(requireContext(), "Não foi possível obter a localização. Tente novamente.")
                return@launch
            }

            val lat = loc.latitude
            val lng = loc.longitude
            val cadLat = tarefa.clienteLat
            val cadLng = tarefa.clienteLng
            val msg = if (cadLat != null && cadLng != null) {
                "A distância entre a localização atual e o cadastro é de %.0f m."
                    .format(distanciaMetros(lat, lng, cadLat, cadLng))
            } else {
                "O cadastro ainda não possui coordenadas. A localização atual será salva."
            }

            MaterialAlertDialogBuilder(requireContext())
                .setTitle("Salvar localização do cliente")
                .setMessage("$msg\n\nConfirmar que esta é a localização real do cliente?")
                .setPositiveButton("Salvar") { _, _ ->
                    lifecycleScope.launch {
                        try {
                            withContext(Dispatchers.IO) {
                                ApiClient.api.atualizarCoordenadasCliente(tarefa.id, CoordenadasClienteRequest(lat, lng))
                            }
                            showToast(requireContext(), "Localização salva no cadastro do cliente")
                        } catch (e: Exception) {
                            showToast(requireContext(), "Erro ao salvar: ${e.message}")
                        }
                    }
                }
                .setNegativeButton("Cancelar", null)
                .show()
        }
    }

    private fun distanciaMetros(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val R = 6371000.0
        val dLat = (lat2 - lat1) * PI / 180.0
        val dLng = (lng2 - lng1) * PI / 180.0
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(lat1 * PI / 180.0) * cos(lat2 * PI / 180.0) *
            sin(dLng / 2) * sin(dLng / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return R * c
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_LOCATION) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                showToast(requireContext(), "Permissão concedida. Toque na entrega novamente.")
            } else {
                showToast(requireContext(), "Permissão de localização negada")
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

class TarefasAdapter(
    private val context: Context,
    private val items: List<Tarefa>,
    private val hiddenIds: MutableSet<Int>,
    private val onClick: (Tarefa, View) -> Unit
) : RecyclerView.Adapter<TarefasAdapter.VH>() {

    class VH(val binding: ItemTarefaBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(ItemTarefaBinding.inflate(LayoutInflater.from(parent.context), parent, false))
    }

    override fun getItemCount() = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val t = items[position]
holder.binding.apply {
                tvNumero.text = "Entrega #${t.id}"
                tvCliente.text = t.clienteNome ?: "Cliente"
                tvEndereco.text = listOfNotNull(t.clienteEndereco, t.clienteCidade, t.clienteUf).joinToString(" - ")
                val itens = t.itens ?: t.pedidoDescricao ?: ""
                val qtd = t.quantidade ?: 1
                tvProduto.text = "$itens — $qtd ${if (qtd == 1) "item" else "itens"}"
                tvPagamento.text = t.pagamento?.let { "Pagamento: $it" } ?: "Pagamento: —"
                val valor = "%.2f".format(t.valorTotal ?: 0.0)
                tvValor.text = "R$ $valor"
                tvStatus.text = t.status?.replace('_', ' ')?.uppercase() ?: ""
                tvStatus.setTextColor(statusColor(context, t.status))
                root.setOnClickListener { onClick(t, root) }
            holder.itemView.visibility = if (hiddenIds.contains(t.id)) View.GONE else View.VISIBLE
            }
    }
}