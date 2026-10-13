"""AI妈妈 · PWA 与手机端可用性测试
覆盖：manifest 配置、iOS 主屏元信息、Service Worker 注册、移动端布局
"""
import asyncio, os
from playwright.async_api import async_playwright
BASE = os.environ.get("BASE") or ("http://localhost:" + os.environ.get("PORT", "3000"))
ok=fail=0
def chk(n,c,e=""):
    global ok,fail
    if c: ok+=1; print(f"  ✓ {n}")
    else: fail+=1; print(f"  ✗ {n}  {e}")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # 移动端视口 + 触摸
        ctx = await b.new_context(viewport={"width":390,"height":844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            is_mobile=True, has_touch=True, device_scale_factor=3)
        pg = await ctx.new_page()
        errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(BASE, wait_until="networkidle")
        await pg.wait_for_timeout(1500)

        print("===== PWA 配置 =====")
        manifest = await pg.evaluate("document.querySelector('link[rel=manifest]')?.getAttribute('href')")
        chk("已声明 manifest", manifest=="/manifest.webmanifest", str(manifest))
        apple = await pg.evaluate("document.querySelector('meta[name=\"apple-mobile-web-app-capable\"]')?.content")
        chk("iOS 可全屏打开", apple=="yes", str(apple))
        title = await pg.evaluate("document.querySelector('meta[name=\"apple-mobile-web-app-title\"]')?.content")
        chk("iOS 主屏名称", title=="AI妈妈", str(title))
        icon = await pg.evaluate("document.querySelector('link[rel=\"apple-touch-icon\"]')?.getAttribute('href')")
        chk("iOS 主屏图标", icon=="/icon-192.png", str(icon))
        theme = await pg.evaluate("document.querySelector('meta[name=theme-color]')?.content")
        chk("主题色已设", bool(theme), str(theme))

        print("===== manifest 内容 =====")
        mf = await pg.evaluate("fetch('/manifest.webmanifest').then(r=>r.json())")
        chk("名称正确", "AI妈妈" in mf.get("name",""), str(mf.get("name")))
        chk("短名称正确", mf.get("short_name")=="AI妈妈")
        chk("独立窗口模式", mf.get("display")=="standalone", str(mf.get("display")))
        chk("竖屏锁定", mf.get("orientation")=="portrait")
        chk("含 192 图标", any("192" in i["src"] for i in mf.get("icons",[])))
        chk("含 512 图标", any("512" in i["src"] for i in mf.get("icons",[])))
        chk("含遮罩图标", any(i.get("purpose")=="maskable" for i in mf.get("icons",[])))

        print("===== Service Worker =====")
        sw = await pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>r? (r.active?'active':(r.installing?'installing':'waiting')) : 'none')")
        chk("SW 已注册并激活", sw=="active", str(sw))
        caches = await pg.evaluate("caches.keys()")
        chk("缓存已建立", len(caches)>0, str(caches))

        print("===== 手机端可用性 =====")
        chk("无横向溢出", await pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"),
            f"scrollW={await pg.evaluate('document.documentElement.scrollWidth')} winW=390")
        chk("底部导航可点", await pg.locator('.nav-item[data-nav="home"]').is_visible())
        chk("首页卡片渲染", await pg.locator("#homeList .card").count() > 0)
        # 点一个 tab 看是否响应
        await pg.locator('.nav-item[data-nav="learn"]').click()
        await pg.wait_for_timeout(900)
        chk("可切到学习页", await pg.locator("#learnList .card").count() > 0)

        print(f"\n结果：{ok} 通过 / {fail} 失败")
        print(f"JS 报错：{len(errs)} 条")
        for e in errs[:5]: print("   ", e)
        await b.close()
asyncio.run(main())
