package com.tvhub.app

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide

private data class Channel(val name: String, val category: String, val logo: String, val url: String)

class MainActivity : AppCompatActivity() {
    private lateinit var playerView: PlayerView
    private lateinit var list: RecyclerView
    private lateinit var empty: TextView
    private val channels = mutableListOf<Channel>()
    private var player: ExoPlayer? = null

    private val pickPlaylist = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode != Activity.RESULT_OK) return@registerForActivityResult
        result.data?.data?.let { uri -> contentResolver.openInputStream(uri)?.bufferedReader()?.use { loadPlaylist(it.readText()) } }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(8, 11, 13)
        setContentView(buildUi())
    }

    private fun buildUi(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(8, 11, 13))
            setPadding(28, 18, 28, 18)
        }
        val header = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        val title = TextView(this).apply {
            text = "TV HUB"
            textSize = 24f
            setTextColor(Color.rgb(242, 245, 243))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        val button = Button(this).apply {
            text = "Carregar M3U"
            setTextColor(Color.rgb(8, 11, 13))
            setBackgroundColor(Color.rgb(200, 243, 107))
            setOnClickListener { pickPlaylist.launch(Intent(Intent.ACTION_OPEN_DOCUMENT).apply { type = "*/*"; addCategory(Intent.CATEGORY_OPENABLE) }) }
        }
        header.addView(title, LinearLayout.LayoutParams(0, 64, 1f))
        header.addView(button, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, 56))
        root.addView(header)

        playerView = PlayerView(this).apply { visibility = View.GONE; useController = true }
        root.addView(playerView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 0.58f))
        empty = TextView(this).apply {
            text = "Escolhe uma playlist M3U autorizada"
            textSize = 18f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(137, 147, 147))
        }
        root.addView(empty, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 0.42f))
        list = RecyclerView(this).apply { layoutManager = LinearLayoutManager(this@MainActivity); adapter = ChannelAdapter() }
        root.addView(list, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 0.42f))
        return root
    }

    private fun loadPlaylist(text: String) {
        channels.clear()
        val lines = text.removePrefix("\uFEFF").lines().map { it.trim() }.filter { it.isNotEmpty() }
        var index = 0
        while (index < lines.size) {
            if (!lines[index].startsWith("#EXTINF", true)) { index++; continue }
            val metadata = lines[index]
            val comma = metadata.indexOf(',')
            val name = if (comma >= 0) metadata.substring(comma + 1).trim() else "Sem nome"
            val category = attribute(metadata, "group-title").ifBlank { "Outros" }
            val logo = attribute(metadata, "tvg-logo")
            val url = lines.drop(index + 1).firstOrNull { !it.startsWith("#") }
            if (!url.isNullOrBlank()) channels += Channel(name, category, logo, url)
            index = lines.indexOfFirst { it == url }.takeIf { it > index } ?: index + 1
        }
        empty.visibility = if (channels.isEmpty()) View.VISIBLE else View.GONE
        list.visibility = if (channels.isEmpty()) View.GONE else View.VISIBLE
        list.adapter?.notifyDataSetChanged()
    }

    private fun attribute(line: String, key: String): String = Regex("$key=\\\"([^\\\"]*)\\\"", RegexOption.IGNORE_CASE).find(line)?.groupValues?.get(1).orEmpty()

    private fun play(channel: Channel) {
        playerView.visibility = View.VISIBLE
        if (player == null) player = ExoPlayer.Builder(this).build().also { playerView.player = it }
        player?.setMediaItem(MediaItem.Builder().setUri(Uri.parse(channel.url)).setMediaMetadata(MediaMetadata.Builder().setTitle(channel.name).build()).build())
        player?.prepare()
        player?.playWhenReady = true
    }

    override fun onStop() { super.onStop(); player?.release(); player = null }

    private inner class ChannelAdapter : RecyclerView.Adapter<ChannelHolder>() {
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = ChannelHolder(LinearLayout(this@MainActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(14, 8, 14, 8)
            isFocusable = true
            setBackgroundColor(Color.rgb(17, 22, 25))
        })
        override fun getItemCount() = channels.size
        override fun onBindViewHolder(holder: ChannelHolder, position: Int) = holder.bind(channels[position])
    }

    private inner class ChannelHolder(private val row: LinearLayout) : RecyclerView.ViewHolder(row) {
        private val logo = ImageView(this@MainActivity)
        private val label = TextView(this@MainActivity)
        init {
            row.addView(logo, LinearLayout.LayoutParams(58, 58))
            row.addView(label, LinearLayout.LayoutParams(0, 70, 1f).apply { leftMargin = 16 })
            row.setOnClickListener { play(channels[bindingAdapterPosition]) }
        }
        fun bind(channel: Channel) {
            label.text = "${channel.name}\n${channel.category}"
            label.textSize = 16f
            label.setTextColor(Color.rgb(242, 245, 243))
            if (channel.logo.isNotBlank()) Glide.with(this@MainActivity).load(channel.logo).into(logo) else logo.setImageResource(android.R.drawable.ic_media_play)
        }
    }
}
