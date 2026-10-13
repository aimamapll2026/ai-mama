"""AI妈妈 v1.4 · 浏览器端测试（移动端视口）
覆盖：设置页新增的 AI 引擎卡与邮箱推送卡、AI 结果来源标注、演示模式兜底
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE") or ("http://localhost:" + os.environ.get("PORT", "3000"))
results = []
errors = []


def ok(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("  ✓ " if cond else "  ✗ ") + name + (("  → " + str(extra)) if (extra and not cond) else ""))


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
        )
        page = await ctx.new_page()

        def on_console(msg):
            if msg.type == "error":
                errors.append(msg.text)

        page.on("console", lambda m: on_console(m))
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))

        await page.goto(BASE, wait_until="networkidle")
        await page.wait_for_timeout(900)

        print("\n===== 1. 首页加载 =====")
        ok("标题正确", await page.title() == "AI妈妈 · 变现机会工作台", await page.title())
        ok("副标题为变现管家", "变现管家" in (await page.inner_text("#brandSub")))
        ok("演示模式未误触发", await page.is_hidden("#demoChip"),
           "demoChip 可见说明降级了")
        stats = await page.inner_text("#statRow")
        ok("统计区渲染", "全部机会" in stats and "免费申样" in stats, stats.replace("\n", " "))

        print("\n===== 2. 设置页 · AI 引擎卡 =====")
        await page.click('.nav-item[data-nav="settings"]')
        await page.wait_for_timeout(900)
        box = page.locator("#aiEngineBox")
        ok("AI 引擎卡已渲染", await box.count() == 1 and (await box.inner_text()).strip() != "")
        txt = await box.inner_text()
        ok("显示本地规则引擎状态", "本地规则引擎" in txt, txt[:80])
        ok("展示 5 个服务商", await box.locator(".engine-pick .ep").count() >= 5,
           await box.locator(".engine-pick .ep").count())
        ok("有 API Key 输入框", await page.locator("#aiKeyInput").count() == 1)
        ok("Key 框为密码类型", await page.get_attribute("#aiKeyInput", "type") == "password")
        ok("有保存按钮", await page.locator("#aiSaveBtn").count() == 1)
        ok("有测试连接按钮", await page.locator("#aiTestBtn").count() == 1)
        ok("有获取 Key 的引导", "怎么拿到 Key" in txt)
        ok("有密钥安全说明", "settings.json" in txt)

        print("\n===== 3. 设置页 · 邮箱推送卡 =====")
        mbox = page.locator("#mailPushBox")
        ok("邮件卡已渲染", await mbox.count() == 1 and (await mbox.inner_text()).strip() != "")
        mtxt = await mbox.inner_text()
        ok("提示未配置", "还没配置" in mtxt, mtxt[:80])
        ok("自动带出 QQ 邮箱", "375087889@qq.com" in await page.input_value("#smtpUserInput"),
           await page.input_value("#smtpUserInput"))
        ok("自动带出收件邮箱", "375087889@qq.com" in await page.input_value("#mailToInput"),
           await page.input_value("#mailToInput"))
        ok("默认选中 QQ 邮箱", "on" in (await page.get_attribute('.ep[data-id="qq"]', "class") or ""),
           await page.get_attribute('.ep[data-id="qq"]', "class"))
        ok("有授权码输入框", await page.locator("#smtpPassInput").count() == 1)
        ok("授权码框为密码类型", await page.get_attribute("#smtpPassInput", "type") == "password")
        ok("提示区分授权码与密码", "不是邮箱密码" in mtxt)
        ok("有 QQ 邮箱配置教程", "IMAP/SMTP" in mtxt or "16 位授权码" in mtxt)
        ok("有测试发信按钮", await page.locator("#mailTestBtn").count() == 1)

        print("\n===== 4. AI 引擎切换交互 =====")
        await page.click('.engine-pick .ep[data-id="dashscope"]')
        await page.wait_for_timeout(300)
        base_val = await page.input_value("#aiBaseInput")
        ok("切换服务商自动填充接口地址", "dashscope" in base_val, base_val)
        model_val = await page.input_value("#aiModelInput")
        ok("切换服务商自动填充模型名", model_val == "qwen-plus", model_val)

        # 保存一个假 Key，验证 UI 状态翻转
        await page.fill("#aiKeyInput", "sk-fake-test-1234567890abcdef")
        await page.click("#aiSaveBtn")
        await page.wait_for_timeout(1200)
        saved = await page.inner_text("#aiEngineBox")
        ok("保存后状态翻转为已接入", "已接入大模型" in saved, saved[:120])
        ok("显示脱敏后的 Key", "****" in saved, saved[:150])

        # 测试连接（假 Key 应失败，但页面不能崩）
        await page.click("#aiTestBtn")
        await page.wait_for_timeout(4000)
        tres = await page.inner_text("#aiTestResult")
        ok("假 Key 测试连接给出失败提示", "失败" in tres or "❌" in tres, tres[:120])
        ok("测试失败后清除按钮出现", await page.locator("#aiClearBtn").count() == 1)

        # 清除 Key，回到规则引擎
        await page.click("#aiClearBtn")
        await page.wait_for_timeout(1200)
        cleared = await page.inner_text("#aiEngineBox")
        ok("清除后回到规则引擎", "本地规则引擎" in cleared, cleared[:120])

        print("\n===== 5. 邮件测试（未配授权码） =====")
        await page.click("#mailTestBtn")
        await page.wait_for_timeout(3000)
        mres = await page.inner_text("#mailTestResult")
        ok("未配授权码时提示明确", "授权码" in mres, mres[:120])

        print("\n===== 6. AI 结果来源标注 =====")
        await page.evaluate("nav('list')")
        await page.wait_for_timeout(800)
        await page.evaluate("openDetail('op-prize-003')")
        await page.wait_for_timeout(900)
        await page.click("#toolBtn")
        await page.wait_for_timeout(700)
        await page.fill("#evalText", "我做家居内容三年了。第一，别买成套收纳盒。第二，先量尺寸再买。"
                                     "第三，按使用频率分层。总结一下，收纳的本质是重新梳理你和物品的关系。")
        await page.click("#doEval")
        await page.wait_for_timeout(2500)
        eres = await page.inner_text("#evalResult")
        ok("评估结果渲染", "逐条对照" in eres and "改进建议" in eres, eres[:100])
        ok("标注为本地规则引擎", "本地规则引擎" in eres, eres[:200])
        ok("显示降级原因", "API Key" in eres, eres[:250])
        ok("总分动画区渲染", await page.locator("#scoreNum").count() == 1)

        # 改写
        await page.click("#doRewrite")
        await page.wait_for_timeout(2500)
        rw = await page.inner_text("#rewriteBox")
        ok("改写区渲染", "原稿" in rw and "改写稿" in rw, rw[:120])
        ok("改写区标注来源", "本地规则引擎" in rw, rw[:200])

        print("\n===== 7. 原有功能未回归 =====")
        await page.evaluate("nav('home')")
        await page.wait_for_timeout(800)
        cards = await page.locator("#homeList .card").count()
        ok("首页卡片正常", cards > 0, cards)
        await page.evaluate("nav('learn')")
        await page.wait_for_timeout(900)
        lc = await page.locator("#learnList .card").count()
        ok("学习页卡片正常", lc == 6, lc)
        await page.evaluate("nav('list')")
        await page.wait_for_timeout(800)
        await page.click('.tab[data-type="sample"]')
        await page.wait_for_timeout(900)
        sc = await page.locator("#listResult .card").count()
        ok("免费申样筛选正常", sc == 6, sc)

        # 详情页 + 申样自检
        await page.evaluate("openDetail('op-sample-001')")
        await page.wait_for_timeout(900)
        det = await page.inner_text("#page-detail")
        ok("申样详情渲染", "资格自检" in det or "5000" in det, det[:150])

        print("\n===== 8. 截图 =====")
        await page.evaluate("nav('settings')")
        await page.wait_for_timeout(1000)
        await page.screenshot(path="/tmp/settings_ai.png", full_page=True)
        ok("设置页截图已保存", True)
        await page.evaluate("nav('home')")
        await page.wait_for_timeout(700)
        await page.screenshot(path="/tmp/home_v14.png")
        ok("首页截图已保存", True)

        await browser.close()

    print("\n" + "=" * 46)
    p = sum(1 for _, c, _ in results if c)
    f = len(results) - p
    print(f"结果：{p} 通过 / {f} 失败")
    if f:
        print("失败项：")
        for n, c, e in results:
            if not c:
                print(f"  - {n}  ({e})")
    print(f"JS 报错：{len(errors)} 条")
    for e in errors[:6]:
        print("  ! " + e[:160])
    print("=" * 46)
    sys.exit(1 if (f or errors) else 0)


asyncio.run(main())
